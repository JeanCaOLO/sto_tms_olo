// Simulación del modo mock: lee data/viajes-demo.json (tiempos relativos a "ahora") y produce la misma forma
// que /api/v1/tracking/* (contrato v2). Mantiene estado en memoria: los camiones avanzan solos (tiempo
// acelerado) y, al entregar la última parada, el viaje se cierra solo (lo que en real reporta la app del chofer).
// Reglas iguales a backend/tracking/src/tracking_logic.py. La consume solo fakeTrackingBackend.ts.
import demo from '../data/viajes-demo.json';
import type {
  Evidence, ListMode, MapColor, Phase, Position, Recorrido, Resumen, Signal, Stop, StopState, TripAlert, Viaje, ViajeDetalle,
  ViajePlanificado, ViajesPage,
} from '../types';

const MIN = 60_000;
const SPEED_KMH = 30;
const DETOUR = 1.35;
const SERVICE_MIN = 5;
const LATE_MIN = 15;
const STOPPED_MIN = 20;
const ONLINE_MIN = 5;
const STALE_MIN = 30;
const DEPARTURE_M = 300;
const ARRIVE_M = 150;
const TICK_MS = 3000; // ms de tiempo simulado entre pasos del camión
const MAX_TRAIL = 2000;

const TIMEZONES: Record<string, string> = { CR: 'America/Costa_Rica', VN: 'America/Caracas' };

/** Error con código HTTP: el backend simulado lo traduce al sobre `{ error }`. */
export class SimError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface StopDef {
  customer: string; address: string; city: string; lat: number; lng: number; invoice: string;
  state: StopState; arrivedMinAgo?: number; evidence?: 'full' | 'invoice' | 'none'; recipient?: string;
}
interface TripDef {
  id: string; route_number: string; country: string; zone: string; driver: string; plate: string;
  origin: [number, number]; stops: StopDef[]; startedMinAgo: number; endedMinAgo?: number; lastSignalMinAgo: number;
  at: 'origin' | `stop:${number}` | [number, number]; moving?: boolean; stoppedMin?: number; delayMin?: number;
}
interface PlannedDef { id: string; zone: string; plate: string; driver: string; country: string; origin: [number, number]; stops: StopDef[] }

interface SStop { id: string; def: StopDef; state: StopState; arrivedAt: number | null; evidence: 'full' | 'invoice' | 'none'; recipient: string | null }
interface STrip {
  id: string; def: PlannedDef | TripDef; routeNumber: string; origin: [number, number]; stops: SStop[];
  startedAt: number; endedAt: number | null; departedAt: number | null; lastSignalAt: number; pos: [number, number];
  moving: boolean; stoppedMin: number; planned: number[]; plannedEnd: number; trail: Position[];
}

// --- geometría y tiempos -----------------------------------------------------------------------------

export function haversineM(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Minutos de conducción: línea recta x 1,35 a 30 km/h. */
export function driveMinutes(meters: number): number {
  return ((meters * DETOUR) / 1000 / SPEED_KMH) * 60;
}

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
const coords = (s: SStop): [number, number] => [s.def.lat, s.def.lng];

function schedule(origin: [number, number], stops: SStop[], from: number): { planned: number[]; end: number } {
  let t = from;
  let prev = origin;
  const planned = stops.map((s) => {
    t += driveMinutes(haversineM(prev, coords(s))) * MIN;
    const arrive = t;
    t += SERVICE_MIN * MIN;
    prev = coords(s);
    return arrive;
  });
  return { planned, end: t };
}

/** Fecha local (YYYY-MM-DD) de un instante en la zona del país. */
function localDate(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

// --- reloj simulado: velocidad y pausa (solo modo mock) ----------------------------------------------

export const SPEEDS = [0.5, 1, 2, 5, 10, 30, 60];
const DEFAULT_SPEED = 5;
let speed = DEFAULT_SPEED;
let paused = false;
let virtualNow = 0;
let lastReal = 0;

/** "Ahora" simulado: avanza `speed` veces más rápido que el reloj real y se congela en pausa. */
function clock(): number {
  const real = Date.now();
  if (!virtualNow) virtualNow = real;
  else if (!paused) virtualNow += (real - lastReal) * speed;
  lastReal = real;
  return virtualNow;
}

export const simNow = () => clock();

export function getSimulation() {
  clock();
  return { speed, paused };
}

export function setSimulation(patch: { speed?: number; paused?: boolean }) {
  clock(); // asienta el tiempo transcurrido con la velocidad anterior
  if (patch.speed != null && SPEEDS.includes(patch.speed)) speed = patch.speed;
  if (patch.paused != null) paused = patch.paused;
  return { speed, paused };
}

// --- estado en memoria -------------------------------------------------------------------------------

let trips: STrip[] = [];
let planned: PlannedDef[] = [];
let lastTick = 0;
let seeded = false;

function buildStops(tripId: string, defs: StopDef[], now: number): SStop[] {
  return defs.map((def, i) => ({
    id: `${tripId}-s${i}`, def, state: def.state, arrivedAt: def.arrivedMinAgo != null ? now - def.arrivedMinAgo * MIN : null,
    evidence: def.evidence ?? 'none', recipient: def.state === 'delivered' ? def.recipient ?? null : null,
  }));
}

function startPosition(def: TripDef, stops: SStop[]): [number, number] {
  if (def.at === 'origin') return def.origin;
  if (Array.isArray(def.at)) return def.at;
  return coords(stops[Number(def.at.split(':')[1])]);
}

function point(pos: [number, number], at: number, moving: boolean): Position {
  return { lat: pos[0], lng: pos[1], speed_mps: moving ? Math.round((SPEED_KMH / 3.6) * 10) / 10 : 0, recorded_at: new Date(at).toISOString() };
}

function seed(now: number) {
  trips = (demo.trips as unknown as TripDef[]).map((def) => {
    const stops = buildStops(def.id, def.stops, now);
    const startedAt = now - def.startedMinAgo * MIN;
    const plan = schedule(def.origin, stops, startedAt);
    const pos = startPosition(def, stops);
    const atOrigin = pos[0] === def.origin[0] && pos[1] === def.origin[1];
    const trip: STrip = {
      id: def.id, def, routeNumber: def.route_number, origin: def.origin, stops, startedAt,
      endedAt: def.endedMinAgo != null ? now - def.endedMinAgo * MIN : null, departedAt: atOrigin ? null : startedAt + 2 * MIN,
      lastSignalAt: now - def.lastSignalMinAgo * MIN, pos, moving: def.moving ?? false, stoppedMin: def.stoppedMin ?? 0,
      planned: plan.planned, plannedEnd: plan.end, trail: [],
    };
    // Calibra el plan para que el retraso de la próxima parada sea el pedido en el JSON (por defecto, a tiempo).
    const target = trip.endedAt == null ? stops.findIndex((s) => s.state === 'pending') : -1;
    if (target >= 0) {
      const shift = etas(trip, now).get(stops[target].id)!.eta - (def.delayMin ?? 0) * MIN - trip.planned[target];
      trip.planned = trip.planned.map((v) => v + shift);
      trip.plannedEnd += shift;
    }
    trip.trail = atOrigin
      ? [point(pos, trip.lastSignalAt, trip.moving)]
      : [0, 0.25, 0.5, 0.75, 1].map((f) => point([def.origin[0] + (pos[0] - def.origin[0]) * f, def.origin[1] + (pos[1] - def.origin[1]) * f],
        startedAt + (trip.lastSignalAt - startedAt) * f, trip.moving));
    return trip;
  });
  planned = demo.planned as unknown as PlannedDef[];
  lastTick = now;
  seeded = true;
}

function ensure(now: number) {
  if (!seeded) seed(now);
  advance(now);
}

/** Reinicia los datos de prueba (viajes, posiciones, velocidad y pausa). */
export function resetSimulation(now = Date.now()) {
  speed = DEFAULT_SPEED;
  paused = false;
  virtualNow = now;
  lastReal = Date.now();
  seeded = false;
  seed(now);
  return { speed, paused };
}

// --- simulación del camión ---------------------------------------------------------------------------

function nextPending(trip: STrip): SStop | undefined {
  return trip.stops.find((s) => s.state === 'pending');
}

function advance(now: number) {
  if (now - lastTick < TICK_MS) return;
  const elapsed = (now - lastTick) / 1000; // segundos simulados
  lastTick = now;
  for (const trip of trips) {
    if (trip.endedAt != null || !trip.moving) continue;
    trip.lastSignalAt = now;
    let meters = elapsed * (SPEED_KMH / 3.6);
    while (meters > 0) {
      const target = nextPending(trip);
      if (!target) { trip.endedAt = now; break; }
      const to = coords(target);
      const dist = haversineM(trip.pos, to);
      if (dist <= meters + ARRIVE_M) {
        trip.pos = to;
        target.state = 'delivered';
        target.arrivedAt = now;
        target.evidence = 'full';
        target.recipient = 'Recibe encargado';
        meters -= dist;
        if (!nextPending(trip)) { trip.endedAt = now; break; }
      } else {
        const f = meters / dist;
        trip.pos = [trip.pos[0] + (to[0] - trip.pos[0]) * f, trip.pos[1] + (to[1] - trip.pos[1]) * f];
        meters = 0;
      }
    }
    if (trip.departedAt == null && haversineM(trip.pos, trip.origin) > DEPARTURE_M) trip.departedAt = now;
    trip.trail.push(point(trip.pos, now, true));
    if (trip.trail.length > MAX_TRAIL) trip.trail.shift();
  }
}

// --- campos derivados (mismas reglas que tracking_logic.py) -----------------------------------------------

function signalOf(trip: STrip, now: number): Signal {
  const age = (now - trip.lastSignalAt) / MIN;
  return age <= ONLINE_MIN ? 'online' : age <= STALE_MIN ? 'stale' : 'offline';
}

interface Eta { dist: number; eta: number; delay: number }

/** ETA encadenada a cada parada pendiente, en orden de secuencia. */
function etas(trip: STrip, now: number): Map<string, Eta> {
  const out = new Map<string, Eta>();
  let t = now;
  let cur: [number, number] = trip.pos;
  for (const s of trip.stops) {
    if (s.state !== 'pending') continue;
    const dist = haversineM(cur, coords(s));
    t += driveMinutes(dist) * MIN;
    out.set(s.id, { dist: haversineM(trip.pos, coords(s)), eta: t, delay: Math.round((t - trip.planned[trip.stops.indexOf(s)]) / MIN) });
    t += SERVICE_MIN * MIN;
    cur = coords(s);
  }
  return out;
}

function toViaje(trip: STrip, now: number): Viaje {
  const state = trip.endedAt != null ? 'completed' : 'active';
  const active = state === 'active';
  const signal: Signal = active ? signalOf(trip, now) : 'none';
  const phase: Phase | null = active ? (trip.departedAt != null ? 'en_ruta' : 'por_salir') : null;
  const color: MapColor = !active ? 'blue' : signal === 'online' ? 'green' : signal === 'stale' ? 'amber' : 'gray';
  const delivered = trip.stops.filter((s) => s.state === 'delivered').length;
  const failed = trip.stops.filter((s) => s.state === 'failed').length;
  const total = trip.stops.length;
  const next = nextPending(trip);
  const delay = active && next ? etas(trip, now).get(next.id)?.delay ?? null : null;
  const alerts: TripAlert[] = [];
  if (failed > 0) alerts.push({ code: 'failed', count: failed });
  if (active && signal === 'offline') alerts.push({ code: 'no_signal' });
  if (active && delay != null && delay > LATE_MIN) alerts.push({ code: 'late', count: delay });
  if (active && trip.stoppedMin >= STOPPED_MIN) alerts.push({ code: 'stopped', count: trip.stoppedMin });
  const def = trip.def;
  return {
    id: trip.id, route_number: trip.routeNumber, state, phase, signal, color, driver_name: def.driver, plate: def.plate,
    zone_name: def.zone, country: def.country, timezone: TIMEZONES[def.country] ?? null, started_at: iso(trip.startedAt),
    ended_at: iso(trip.endedAt), planned_end_at: iso(trip.plannedEnd), route_date: localDate(trip.startedAt, TIMEZONES[def.country] ?? 'UTC'),
    position: point(trip.pos, trip.lastSignalAt, trip.moving && active && !paused),
    progress: { total, done: delivered + failed, delivered, failed, percent: total ? Math.round(((delivered + failed) / total) * 100) : 0 },
    delay_min: delay, alerts,
  };
}

// --- evidencias de ejemplo (imágenes SVG en línea, sin red) -----------------------------------------------

function placeholder(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="100%" height="100%" fill="${color}"/>` +
    `<text x="50%" y="50%" font-family="sans-serif" font-size="22" fill="#334155" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function evidencesOf(stop: SStop): Evidence[] {
  if (stop.state !== 'delivered' || stop.evidence === 'none') return [];
  const at = iso(stop.arrivedAt);
  const list: Evidence[] = [{ id: `${stop.id}-f`, kind: 'photo_invoice', mime_type: 'image/svg+xml', captured_at: at, url: placeholder(`Factura ${stop.def.invoice}`, '#e2e8f0') }];
  if (stop.evidence === 'full') list.push({ id: `${stop.id}-s`, kind: 'signature', mime_type: 'image/svg+xml', captured_at: at, url: placeholder('Firma del cliente', '#f1f5f9') });
  return list;
}

function toStop(trip: STrip, stop: SStop, index: number, next: Map<string, Eta>): Stop {
  const eta = next.get(stop.id);
  return {
    id: stop.id, guide_number: `${trip.routeNumber}-${index + 1}`, sequence: index + 1, state: stop.state,
    order_number: `PED-${stop.def.invoice.slice(4)}`, invoice_number: stop.def.invoice, customer_name: stop.def.customer,
    address: stop.def.address, city: stop.def.city, lat: stop.def.lat, lng: stop.def.lng, arrived_at: iso(stop.arrivedAt),
    recipient_name: stop.recipient, evidences: evidencesOf(stop), planned_arrival_at: iso(trip.planned[index]),
    distance_m: eta ? Math.round(eta.dist) : null, eta_at: iso(eta?.eta ?? null), delay_min: eta ? eta.delay : null,
  };
}

// --- lecturas (misma forma que el backend) -----------------------------------------------------------

const byId = (id: string): STrip => {
  const trip = trips.find((t) => t.id === id);
  if (!trip) throw new SimError('Viaje no encontrado', 404);
  return trip;
};

const inCountry = (country: string | null) => (t: { def: { country: string } }) => !country || t.def.country === country;

export interface SimListParams { mode: ListMode; q: string; limit: number; cursor: string | null; country: string | null; summary: boolean }

export function simList(p: SimListParams): ViajesPage {
  const now = clock();
  ensure(now);
  const text = p.q.trim().toLowerCase();
  const all = trips
    .filter(inCountry(p.country))
    .filter((t) => (p.mode === 'active' ? t.endedAt == null : true))
    .filter((t) => !text || [t.routeNumber, t.def.driver, t.def.plate].some((v) => v.toLowerCase().includes(text)))
    .sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id));
  const offset = p.cursor ? Number(p.cursor) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new SimError('cursor inválido', 400);
  const page = all.slice(offset, offset + p.limit).map((t) => toViaje(t, now));
  const data: ViajesPage = { items: page, next_cursor: offset + p.limit < all.length ? String(offset + p.limit) : null };
  if (p.summary) data.summary = simSummary(p.country, now);
  return data;
}

function simSummary(country: string | null, now: number): Resumen {
  const scoped = trips.filter(inCountry(country));
  const active = scoped.filter((t) => t.endedAt == null).map((t) => toViaje(t, now));
  const late = active.filter((v) => v.alerts.some((a) => a.code === 'late')).length;
  const completedToday = scoped.filter((t) => {
    if (t.endedAt == null) return false;
    const tz = TIMEZONES[t.def.country] ?? 'UTC';
    return localDate(t.endedAt, tz) === localDate(now, tz);
  }).length;
  return {
    active: active.length, late, on_time: active.length - late,
    no_signal: active.filter((v) => v.alerts.some((a) => a.code === 'no_signal')).length, completed_today: completedToday,
  };
}

export function simDetail(id: string): ViajeDetalle {
  const now = clock();
  ensure(now);
  const trip = byId(id);
  const next = trip.endedAt == null ? etas(trip, now) : new Map<string, Eta>();
  return {
    ...toViaje(trip, now),
    origin: { lat: trip.origin[0], lng: trip.origin[1], name: `CD-${trip.def.country}` },
    next_stop_id: trip.endedAt == null ? nextPending(trip)?.id ?? null : null,
    departed_at: iso(trip.departedAt),
    stops: trip.stops.map((s, i) => toStop(trip, s, i, next)),
  };
}

export function simRecorrido(id: string): Recorrido {
  const now = clock();
  ensure(now);
  return { points: byId(id).trail.map((p) => ({ lat: p.lat, lng: p.lng, at: p.recorded_at })) };
}

export function simPlanned(country: string | null): ViajePlanificado[] {
  const now = clock();
  ensure(now);
  const today = localDate(now, 'UTC');
  return planned.filter((p) => !country || p.country === country).filter((p) => !trips.some((t) => t.id === `trip-${p.id}`))
    .map((p) => ({ plan_trip_id: p.id, plan_date: today, zone: p.zone, plate: p.plate, driver_name: p.driver, stops: p.stops.length }));
}

/** Puente plan → viaje (en real lo dispara la salida reportada por la app). Idempotente. */
export function simStart(planTripId: string) {
  const now = clock();
  ensure(now);
  const def = planned.find((p) => p.id === planTripId);
  if (!def) throw new SimError('Viaje planificado no encontrado', 404);
  const id = `trip-${def.id}`;
  if (trips.some((t) => t.id === id)) return { route_id: id, created: false };
  const stops = buildStops(id, def.stops, now);
  const plan = schedule(def.origin, stops, now);
  trips.push({
    id, def, routeNumber: `VJ-MOCK-${def.id.toUpperCase()}`, origin: def.origin, stops, startedAt: now, endedAt: null, departedAt: null,
    lastSignalAt: now, pos: def.origin, moving: true, stoppedMin: 0, planned: plan.planned, plannedEnd: plan.end,
    trail: [point(def.origin, now, false)],
  });
  return { route_id: id, created: true };
}
