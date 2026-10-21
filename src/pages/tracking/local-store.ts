// Datos locales del tracking: lee data/viajes-demo.json (tiempos relativos a "ahora") y responde con la misma
// forma que /api/v1/tracking/*. Mantiene estado en memoria: los camiones avanzan solos (tiempo acelerado),
// y iniciar / completar / revisar modifican ese estado. Reglas iguales a backend/tracking/src/tracking_logic.py.
import demo from './data/viajes-demo.json';
import { TrackingApiError } from './api-remote';
import type {
  Evidence, ListMode, MapColor, Phase, Position, Resumen, Review, ReviewColor, ReviewReasonCode, Signal, Stop, StopState,
  TripAlert, TripEvent, Viaje, ViajeDetalle, ViajePlanificado,
} from './types';

const MIN = 60_000;
const SPEED_KMH = 30;
const DETOUR = 1.35;
const SERVICE_MIN = 5;
const LATE_MIN = 15;
const VERY_LATE_MIN = 60;
const STOPPED_MIN = 20;
const ONLINE_MIN = 5;
const STALE_MIN = 30;
const DEPARTURE_M = 300;
const ARRIVE_M = 150;
const TICK_MS = 3000; // ms de tiempo simulado entre pasos del camión
const REVIEWER = 'Administrador OLO';

interface NoteDef { kind: 'incident' | 'pickup'; text: string; minAgo: number }
interface ReturnDef { type: string; reason: string; product: string; qty: number }
interface StopDef {
  customer: string; address: string; city: string; lat: number; lng: number; invoice: string; items: number; weight: number;
  state: StopState; arrivedMinAgo?: number; evidence?: 'full' | 'invoice' | 'none'; recipient?: string;
  notes?: NoteDef[]; returns?: ReturnDef[];
}
interface TripDef {
  id: string; route_number: string; country: string; zone: string; driver: string; plate: string; carrier: string;
  origin: [number, number]; stops: StopDef[]; startedMinAgo: number; endedMinAgo?: number; lastSignalMinAgo: number;
  at: 'origin' | `stop:${number}` | [number, number]; moving?: boolean; stoppedMin?: number; lateMinFinal?: number;
  delayMin?: number; reviewedMinAgo?: number; reviewedBy?: string; reviewNote?: string;
}
interface PlannedDef { id: string; zone: string; plate: string; driver: string; carrier: string; country: string; origin: [number, number]; stops: StopDef[] }

interface SStop {
  id: string; def: StopDef; state: StopState; arrivedAt: number | null; evidence: 'full' | 'invoice' | 'none';
  recipient: string | null; notes: { kind: 'incident' | 'pickup'; text: string; at: number }[];
}
interface STrip {
  id: string; def: PlannedDef | TripDef; routeNumber: string; origin: [number, number]; stops: SStop[];
  startedAt: number; endedAt: number | null; lastSignalAt: number; pos: [number, number]; moving: boolean;
  stoppedMin: number; lateMinFinal: number; planned: number[]; plannedEnd: number; capacity: number;
  reviewedAt: number | null; reviewedBy: string | null; reviewNote: string | null; trail: Position[];
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

function schedule(origin: [number, number], stops: SStop[], from: number): { planned: number[]; end: number; km: number } {
  let t = from;
  let prev = origin;
  let meters = 0;
  const planned = stops.map((s) => {
    const leg = haversineM(prev, coords(s));
    meters += leg;
    t += driveMinutes(leg) * MIN;
    const arrive = t;
    t += SERVICE_MIN * MIN;
    prev = coords(s);
    return arrive;
  });
  return { planned, end: t, km: Math.round(((meters * DETOUR) / 1000) * 10) / 10 };
}

// --- reloj simulado: velocidad y pausa (modo de pruebas) ---------------------------------------------

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
    notes: (def.notes ?? []).map((n) => ({ kind: n.kind, text: n.text, at: now - n.minAgo * MIN })),
  }));
}

function position(def: TripDef, stops: SStop[]): [number, number] {
  if (def.at === 'origin') return def.origin;
  if (Array.isArray(def.at)) return def.at;
  return coords(stops[Number(def.at.split(':')[1])]);
}

function seed(now: number) {
  trips = (demo.trips as unknown as TripDef[]).map((def, index) => {
    const stops = buildStops(def.id, def.stops, now);
    const startedAt = now - def.startedMinAgo * MIN;
    const plan = schedule(def.origin, stops, startedAt);
    const pos = position(def, stops);
    const trip: STrip = {
      id: def.id, def, routeNumber: def.route_number, origin: def.origin, stops, startedAt,
      endedAt: def.endedMinAgo != null ? now - def.endedMinAgo * MIN : null, lastSignalAt: now - def.lastSignalMinAgo * MIN,
      pos, moving: def.moving ?? false, stoppedMin: def.stoppedMin ?? 0, lateMinFinal: def.lateMinFinal ?? 0,
      planned: plan.planned, plannedEnd: plan.end, capacity: 40 + ((index * 13) % 50),
      reviewedAt: def.reviewedMinAgo != null ? now - def.reviewedMinAgo * MIN : null, reviewedBy: def.reviewedBy ?? null,
      reviewNote: def.reviewNote ?? null, trail: [],
    };
    // Calibra el plan para que el retraso de la próxima parada sea el pedido en el JSON (por defecto, a tiempo).
    const target = trip.endedAt == null ? stops.findIndex((s) => s.state === 'pending') : -1;
    if (target >= 0) {
      const shift = etas(trip, now).get(stops[target].id)!.eta - (def.delayMin ?? 0) * MIN - trip.planned[target];
      trip.planned = trip.planned.map((v) => v + shift);
      trip.plannedEnd += shift;
    }
    trip.trail = pos[0] === def.origin[0] && pos[1] === def.origin[1]
      ? [point(pos, trip.lastSignalAt, trip.moving)]
      : [0, 0.25, 0.5, 0.75, 1].map((f) => point([def.origin[0] + (pos[0] - def.origin[0]) * f, def.origin[1] + (pos[1] - def.origin[1]) * f],
        startedAt + (trip.lastSignalAt - startedAt) * f, trip.moving));
    return trip;
  });
  planned = demo.planned as unknown as PlannedDef[];
  lastTick = now;
  seeded = true;
}

function point(pos: [number, number], at: number, moving: boolean): Position {
  return { lat: pos[0], lng: pos[1], speed_mps: moving ? Math.round((SPEED_KMH / 3.6) * 10) / 10 : 0, heading_deg: null, battery_pct: 80, recorded_at: new Date(at).toISOString() };
}

function ensure(now: number) {
  if (!seeded) seed(now);
  advance(now);
}

/** Reinicia los datos de prueba (útil en pruebas). */
export function resetLocalData(now = Date.now()) {
  speed = DEFAULT_SPEED;
  paused = false;
  virtualNow = now;
  lastReal = Date.now();
  seeded = false;
  seed(now);
}

// --- simulación del camión ---------------------------------------------------------------------------

function nextPending(trip: STrip): SStop | undefined {
  return trip.stops.find((s) => s.state === 'pending');
}

function finish(trip: STrip, now: number) {
  trip.endedAt = now;
  const delays = trip.stops.filter((s) => s.state === 'delivered' && s.arrivedAt != null)
    .map((s) => Math.round((s.arrivedAt! - trip.planned[trip.stops.indexOf(s)]) / MIN));
  trip.lateMinFinal = Math.max(0, ...delays);
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
      if (!target) { finish(trip, now); break; }
      const to = coords(target);
      const dist = haversineM(trip.pos, to);
      if (dist <= meters + ARRIVE_M) {
        trip.pos = to;
        target.state = 'delivered';
        target.arrivedAt = now;
        target.evidence = 'full';
        target.recipient = 'Recibe encargado';
        meters -= dist;
        if (!nextPending(trip)) { finish(trip, now); break; }
      } else {
        const f = meters / dist;
        trip.pos = [trip.pos[0] + (to[0] - trip.pos[0]) * f, trip.pos[1] + (to[1] - trip.pos[1]) * f];
        meters = 0;
      }
    }
    trip.trail.push(point(trip.pos, now, true));
    if (trip.trail.length > 100) trip.trail.shift();
  }
}

// --- cálculo de campos derivados ---------------------------------------------------------------------

function signalOf(trip: STrip, now: number): Signal {
  const age = (now - trip.lastSignalAt) / MIN;
  return age <= ONLINE_MIN ? 'online' : age <= STALE_MIN ? 'stale' : 'offline';
}

interface Eta { dist: number; eta: number; delay: number }

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

function reviewOf(trip: STrip): Review {
  const failed = trip.stops.filter((s) => s.state === 'failed').length;
  const missing = trip.stops.filter((s) => s.state === 'delivered' && s.evidence !== 'full').length;
  const notes = trip.stops.flatMap((s) => s.notes);
  const incidents = notes.filter((n) => n.kind === 'incident').length;
  const pickups = notes.filter((n) => n.kind === 'pickup').length;
  const returns = trip.stops.reduce((sum, s) => sum + (s.def.returns?.length ?? 0), 0);
  const late = trip.lateMinFinal > LATE_MIN ? trip.lateMinFinal : 0;
  const reasons = ([['failed', failed], ['missing_evidence', missing], ['incidents', incidents], ['pickups', pickups],
    ['returns', returns], ['late', late]] as [ReviewReasonCode, number][]).filter(([, count]) => count > 0).map(([code, count]) => ({ code, count }));
  const color: ReviewColor = failed > 0 || missing > 0 || trip.lateMinFinal > VERY_LATE_MIN ? 'red' : reasons.length > 0 ? 'amber' : 'green';
  return { color, reasons, reviewed_at: iso(trip.reviewedAt), reviewed_by: trip.reviewedBy, note: trip.reviewNote };
}

function toViaje(trip: STrip, now: number): Viaje {
  const state = trip.endedAt != null ? 'completed' : 'active';
  const active = state === 'active';
  const departed = haversineM(trip.pos, trip.origin) > DEPARTURE_M;
  const signal = signalOf(trip, now);
  const phase: Phase | null = active ? (departed ? 'en_ruta' : 'por_salir') : null;
  const color: MapColor = !active ? 'blue' : signal === 'online' ? 'green' : signal === 'stale' ? 'amber' : 'gray';
  const delivered = trip.stops.filter((s) => s.state === 'delivered').length;
  const failed = trip.stops.filter((s) => s.state === 'failed').length;
  const total = trip.stops.length;
  const next = etas(trip, now);
  const nextStop = nextPending(trip);
  const delay = active ? (nextStop ? next.get(nextStop.id)?.delay ?? null : 0) : trip.lateMinFinal;
  const incidents = trip.stops.reduce((sum, s) => sum + s.notes.filter((n) => n.kind === 'incident').length, 0);
  const alerts: TripAlert[] = [];
  if (incidents > 0) alerts.push({ code: 'incident', count: incidents });
  if (failed > 0) alerts.push({ code: 'failed', count: failed });
  if (active && signal === 'offline') alerts.push({ code: 'no_signal' });
  if (active && delay != null && delay > LATE_MIN) alerts.push({ code: 'late', count: delay });
  if (active && trip.stoppedMin >= STOPPED_MIN) alerts.push({ code: 'stopped', count: trip.stoppedMin });
  const def = trip.def;
  return {
    id: trip.id, route_number: trip.routeNumber, state, status_raw: active ? 'En tránsito' : 'Completada', phase, signal, color,
    driver_name: def.driver, plate: def.plate, carrier_name: def.carrier, zone_name: def.zone, started_at: iso(trip.startedAt),
    ended_at: iso(trip.endedAt), planned_end_at: iso(trip.plannedEnd), total_distance_km: schedule(trip.origin, trip.stops, 0).km,
    capacity_percentage: trip.capacity, route_date: iso(trip.startedAt)!.slice(0, 10),
    position: point(trip.pos, trip.lastSignalAt, trip.moving && active && !paused), progress: {
      total, done: delivered + failed, delivered, failed, percent: total ? Math.round(((delivered + failed) / total) * 100) : 0,
    },
    delay_min: delay, incidents, alerts, review: active ? null : reviewOf(trip),
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
    address: stop.def.address, city: stop.def.city, items: stop.def.items, weight: stop.def.weight, lat: stop.def.lat, lng: stop.def.lng,
    arrived_at: iso(stop.arrivedAt), recipient_name: stop.recipient, evidences: evidencesOf(stop),
    incidents: stop.notes.map((n) => ({ at: new Date(n.at).toISOString(), text: n.text, kind: n.kind })),
    returns: (stop.def.returns ?? []).map((r, i) => ({
      id: `${stop.id}-r${i}`, return_number: `DEV-${stop.def.invoice.slice(4)}-${i + 1}`, return_type: r.type, reason: r.reason,
      product_name: r.product, quantity: r.qty, status: 'pending', notes: null,
    })),
    planned_arrival_at: iso(trip.planned[index]), distance_m: eta ? Math.round(eta.dist) : null, eta_at: iso(eta?.eta ?? null),
    delay_min: eta ? eta.delay : null,
  };
}

function eventsOf(trip: STrip): TripEvent[] {
  const list: TripEvent[] = [];
  trip.stops.forEach((s) => {
    if (s.state !== 'pending' && s.arrivedAt != null) list.push({ id: `${s.id}-d`, type: 'delivery', status: s.state, at: new Date(s.arrivedAt).toISOString(), notes: s.def.customer, stop_id: s.id });
    s.notes.forEach((n, i) => list.push({ id: `${s.id}-n${i}`, type: n.kind, status: 'open', at: new Date(n.at).toISOString(), notes: n.text, stop_id: s.id }));
  });
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

// --- API local (misma firma que api-remote.ts) -------------------------------------------------------

const byId = (id: string): STrip => {
  const trip = trips.find((t) => t.id === id);
  if (!trip) throw new TrackingApiError('Viaje no encontrado', 404);
  return trip;
};

/** Viajes del país elegido en el selector global (null = todos). */
const inCountry = (country: string | null) => (t: STrip) => !country || t.def.country === country;

export function localList(mode: ListMode, q: string, limit: number, country: string | null = null) {
  const now = clock();
  ensure(now);
  const text = q.trim().toLowerCase();
  const items = trips
    .filter(inCountry(country))
    .filter((t) => (mode === 'active' ? t.endedAt == null : mode === 'review' ? t.endedAt != null && t.reviewedAt == null : true))
    .filter((t) => !text || [t.routeNumber, t.def.driver, t.def.plate].some((v) => v.toLowerCase().includes(text)))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map((t) => toViaje(t, now));
  return { items, next_cursor: null };
}

export function localDetail(id: string): ViajeDetalle {
  const now = clock();
  ensure(now);
  const trip = byId(id);
  const next = etas(trip, now);
  const viaje = toViaje(trip, now);
  const nearest = [...next.entries()].sort((a, b) => a[1].dist - b[1].dist)[0]?.[0] ?? null;
  return {
    ...viaje, next_stop_id: nearest, departed_at: viaje.phase === 'por_salir' ? null : iso(trip.startedAt + 2 * MIN),
    stops: trip.stops.map((s, i) => toStop(trip, s, i, next)), events: eventsOf(trip),
    trail: trip.trail.map((p) => ({ lat: p.lat, lng: p.lng, at: p.recorded_at })),
  };
}

export function localSummary(country: string | null = null): Resumen {
  const now = clock();
  ensure(now);
  const viajes = trips.filter(inCountry(country)).map((t) => toViaje(t, now));
  const active = viajes.filter((v) => v.state === 'active');
  const late = active.filter((v) => v.alerts.some((a) => a.code === 'late')).length;
  return {
    active: active.length, departing: active.filter((v) => v.phase === 'por_salir').length, late, on_time: active.length - late,
    no_signal: active.filter((v) => v.alerts.some((a) => a.code === 'no_signal')).length,
    stops_done: active.reduce((n, v) => n + v.progress.done, 0), stops_total: active.reduce((n, v) => n + v.progress.total, 0),
    incidents: active.reduce((n, v) => n + v.incidents, 0),
    to_review: viajes.filter((v) => v.state === 'completed' && !v.review?.reviewed_at).length,
  };
}

export function localPlanned(country: string | null = null): ViajePlanificado[] {
  const now = clock();
  ensure(now);
  const today = new Date(now).toISOString().slice(0, 10);
  return planned.filter((p) => !country || p.country === country).filter((p) => !trips.some((t) => t.id === `trip-${p.id}`))
    .map((p) => ({ plan_trip_id: p.id, plan_date: today, zone: p.zone, plate: p.plate, driver_name: p.driver, stops: p.stops.length }));
}

export function localStart(planTripId: string) {
  const now = clock();
  ensure(now);
  const def = planned.find((p) => p.id === planTripId);
  if (!def) throw new TrackingApiError('Viaje planificado no encontrado', 404);
  const id = `trip-${def.id}`;
  if (trips.some((t) => t.id === id)) return { route_id: id, created: false };
  const stops = buildStops(id, def.stops, now);
  const plan = schedule(def.origin, stops, now);
  trips.push({
    id, def, routeNumber: `VJ-LOCAL-${def.id.toUpperCase()}`, origin: def.origin, stops, startedAt: now, endedAt: null, lastSignalAt: now,
    pos: def.origin, moving: true, stoppedMin: 0, lateMinFinal: 0, planned: plan.planned, plannedEnd: plan.end, capacity: 55,
    reviewedAt: null, reviewedBy: null, reviewNote: null, trail: [point(def.origin, now, false)],
  });
  return { route_id: id, created: true };
}

export function localComplete(id: string, force: boolean) {
  const now = clock();
  ensure(now);
  const trip = byId(id);
  const pending = trip.stops.filter((s) => s.state === 'pending').length;
  if (pending > 0 && !force) throw new TrackingApiError(`Quedan ${pending} paradas pendientes`, 409);
  if (trip.endedAt == null) { trip.moving = false; finish(trip, now); }
  return { route_id: id, pending };
}

export function localReview(id: string, note?: string) {
  const now = clock();
  ensure(now);
  const trip = byId(id);
  if (trip.endedAt == null) throw new TrackingApiError('Solo se revisan viajes completados', 409);
  trip.reviewedAt = now;
  trip.reviewedBy = REVIEWER;
  trip.reviewNote = note ?? null;
  return { route_id: id };
}
