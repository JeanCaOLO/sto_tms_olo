// Fuente de datos del calendario basada en el API SIMULADO de eFlow, cacheada en
// localStorage (NO se escribe en Aurora). Mapea expediciones (cabecera+detalle) a
// RoutePlan[]: agrupa por FECHAENTREGA → plan, por RUTA → zona, y parte cada zona
// en viajes de ~3 paradas (planificación ligera, "el pizarrón"). El mismo mapper
// sirve para la data real del sim y para la generada (eflow-sim-seed).

import { fetchExpedicionesCabecera, fetchExpedicionesDetalle } from './eflow-sim-api';
import type { ExpedicionCabecera, ExpedicionDetalle } from './eflow-sim-api';
import { seedEflowSim } from './eflow-sim-seed';
import type { PlanStop, PlanTrip, RoutePlan } from './planes-types';

const LS_KEY = 'tms.eflowSim.planes.v1';
const PARADAS_POR_VIAJE = 3;
const FLOTA = [
  ['CL-1234', 'Hino 300'], ['CL-5678', 'Isuzu NPR'],
  ['CL-9012', 'Hino 500'], ['CL-3344', 'Mitsubishi Canter'],
] as const;

const num = (v: string | null): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

function sumar(det: ExpedicionDetalle[], campo: 'PESO' | 'VOLUMEN'): number | null {
  if (!det.length) return null;
  return +det.reduce((a, d) => a + (d[campo] ?? 0), 0).toFixed(2);
}

function agrupar<T>(xs: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = clave(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function toStop(c: ExpedicionCabecera, det: ExpedicionDetalle[], orden: number): PlanStop {
  return {
    id: `stop-${c.IDEXPEDICION}`, order_id: c.IDEXPEDICION, stop_order: orden,
    order_number: c.IDEXPEDICION, customer_name: c.NOMBRECLIENTE,
    delivery_address: c.DIRECCIONENTREGA, delivery_city: null, delivery_zone: c.RUTA,
    delivery_latitude: num(c.LATITUD), delivery_longitude: num(c.LONGITUD),
    total_weight: sumar(det, 'PESO'), total_volume: sumar(det, 'VOLUMEN'),
  };
}

function toTrip(fecha: string, zona: string, seq: number, stops: PlanStop[]): PlanTrip {
  const [placa, label] = FLOTA[(seq - 1) % FLOTA.length];
  const peso = +stops.reduce((a, s) => a + (s.total_weight ?? 0), 0).toFixed(2);
  const volumen = +stops.reduce((a, s) => a + (s.total_volume ?? 0), 0).toFixed(2);
  return {
    id: `trip-${fecha}-${zona}-${seq}`, status: 'pending', vehicle_id: `veh-${placa}`,
    driver_id: null, delivery_zone: zona, sequence_order: seq,
    total_weight: peso, total_volume: volumen, vehicle_plate: placa, vehicle_label: label,
    vehicle_capacity_weight: 3500, vehicle_capacity_volume: 22,
    is_flota_propia: seq % 3 !== 0, stops,
  };
}

function toPlan(fecha: string, filas: ExpedicionCabecera[], detPorExp: Map<string, ExpedicionDetalle[]>): RoutePlan {
  const trips: PlanTrip[] = [];
  for (const [zona, pedidos] of [...agrupar(filas, (c) => c.RUTA).entries()].sort()) {
    chunk(pedidos, PARADAS_POR_VIAJE).forEach((grupo, i) => {
      const stops = grupo.map((c, k) => toStop(c, detPorExp.get(c.IDEXPEDICION) ?? [], k + 1));
      trips.push(toTrip(fecha, zona, i + 1, stops));
    });
  }
  const ts = new Date().toISOString();
  return {
    id: `plan-${fecha}`, country_id: null, warehouse_id: null, plan_date: fecha,
    status: 'confirmed', notes: null, created_at: ts, updated_at: ts, trips,
    unassigned_order_numbers: [],
  };
}

export function mapExpediciones(cab: ExpedicionCabecera[], det: ExpedicionDetalle[]): RoutePlan[] {
  const detPorExp = agrupar(det, (d) => d.IDEXPEDICION);
  const porFecha = agrupar(cab.filter((c) => c.FECHAENTREGA), (c) => c.FECHAENTREGA!);
  return [...porFecha.entries()].sort().map(([fecha, filas]) => toPlan(fecha, filas, detPorExp));
}

function leer(): RoutePlan[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as RoutePlan[]) : null;
  } catch {
    return null;
  }
}

function guardar(planes: RoutePlan[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(planes));
  } catch {
    /* storage lleno o bloqueado (modo privado): se sigue sin cache */
  }
}

export function limpiarCacheEflowSim(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

async function desdeApiOSeed(): Promise<RoutePlan[]> {
  try {
    const [cab, det] = await Promise.all([fetchExpedicionesCabecera(), fetchExpedicionesDetalle()]);
    if (cab.length) return mapExpediciones(cab, det);
  } catch {
    /* backend del sim no disponible → datos generados */
  }
  const { cabecera, detalle } = seedEflowSim();
  return mapExpediciones(cabecera, detalle);
}

// Planes para el calendario: cache de localStorage si existe; si no, del API del
// sim (y si no responde, del seed generado), y se cachea el resultado.
export async function cargarPlanesEflowSim(): Promise<RoutePlan[]> {
  const cache = leer();
  if (cache?.length) return cache;
  const planes = await desdeApiOSeed();
  guardar(planes);
  return planes;
}
