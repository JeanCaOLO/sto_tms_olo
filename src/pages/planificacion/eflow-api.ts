import type { Conductor, Pedido, RutaTipo, Transportista, Vehiculo, Viaje } from './types';
import { getFallbackPedidos } from './fallback-pedidos';

// Thin client for the read-only EFLOW QA API (`server/`). In dev, Vite proxies
// /api/* -> http://localhost:4000 (`pnpm server`). Real QA data is the default;
// every call falls back to the curated mock if /api is unreachable, so the
// module still works offline.

const TIMEOUT_MS = 4000;

// País activo (cr = Costa Rica, ve = Venezuela). Determina de qué servidor
// EFLOW carga la data — el server enruta por ?pais=. Persistido por-navegador.
export type Pais = 'cr' | 've';
const PAIS_KEY = 'planificacion.pais';

function leerPais(): Pais {
  try {
    const v = localStorage.getItem(PAIS_KEY);
    return v === 've' ? 've' : 'cr';
  } catch {
    return 'cr';
  }
}

let paisActual: Pais = leerPais();
export const getPais = (): Pais => paisActual;
export function setPais(p: Pais): void {
  paisActual = p;
  try {
    localStorage.setItem(PAIS_KEY, p);
  } catch {
    /* modo privado / storage bloqueado: se usa solo en memoria */
  }
}

// Agrega ?pais= al path (respeta un query string previo).
function conPais(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}pais=${paisActual}`;
}

async function getJson<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(conPais(path), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// --- Raw row shapes (see server/README.md + server/queries.mjs) -------------

export interface ViajeRow {
  trip_id: number;
  trip_status: string;
  trip_created: string | null;
  trip_dispatch: string | null;
  route_codes: string | null;
  route_name: string | null;
  route_alias: string | null;
}

interface RutaRow { route_code: string; route_name: string; route_alias: string | null; }
interface TransportistaRow { carrier_id: number; company_name: string; }
interface ConductorRow { driver_id: number; driver_name: string; driver_document: string | null; carrier_id: number | null; }
interface VehiculoRow { vehicle_id: number; license_plate: string; vehicle_brand: string | null; unit_description: string | null; carrier_id: number | null; }

// Order line row for a trip (see docs/guides/eflow-qa-schema-planificacion.md #8).
// Only ~27/959 QA trips have rows here — most trips return [] and the caller
// falls back to the mock. delivery_latitude/longitude come back as strings
// (SQL varchar) and are null for ~71% of clients.
export interface PedidoRow {
  trip_id: number;
  order_number: string;
  invoice_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  delivery_address: string | null;
  delivery_latitude: string | null;
  delivery_longitude: string | null;
  route_code: string | null;
  total_units: number | null;
  total_amount: number | null;
}

// --- Pure mappers: QA row -> view model the components already expect -------

const firstRouteCode = (codes: string | null): string => (codes || '').split(',')[0].trim();
const rutaId = (code: string): string => (code ? `eflow-rt-${code}` : '');

export function mapViaje(row: ViajeRow): Viaje {
  const code = firstRouteCode(row.route_codes);
  const rid = rutaId(code);
  const nombre = (row.route_name || row.route_alias || '').trim();
  return {
    id: String(row.trip_id),
    // El viaje SOLO tiene número; el nombre pertenece a la ruta (route_type_name).
    trip_number: `Viaje ${row.trip_id}`,
    route_type_id: rid,
    route_type_name: nombre,
    trip_date: (row.trip_dispatch || row.trip_created || '').slice(0, 10),
    // QA/PROD trips are PENDING/COMPLETED/MERGED; el tab solo necesita que un
    // viaje sea seleccionable, así que todos mapean a 'despachado'.
    status: 'despachado',
    // Los pedidos se cargan de forma perezosa al elegir el viaje
    // (fetchPedidosDeViaje) — no al listar. Evita el N+1 de traer los pedidos
    // de los ~100 viajes por adelantado.
    pedidos: [],
  };
}

export const mapRuta = (row: RutaRow): RutaTipo => ({
  id: rutaId(row.route_code),
  name: `${row.route_code} · ${(row.route_name || row.route_alias || '').trim()}`,
});

export const mapTransportista = (row: TransportistaRow): Transportista => ({
  id: `eflow-car-${row.carrier_id}`,
  name: row.company_name?.trim() || `Transportista ${row.carrier_id}`,
});

export const mapConductor = (row: ConductorRow): Conductor => ({
  id: `eflow-drv-${row.driver_id}`,
  full_name: row.driver_name?.trim() || `Conductor ${row.driver_id}`,
  document: row.driver_document || '',
  carrier_id: row.carrier_id == null ? '' : `eflow-car-${row.carrier_id}`,
});

// QA returns weight_capacity/volumetric_capacity = 0 for every unit. Keep the
// UI's synthetic capacity so bin-packing still works — guess by truck brand,
// same heuristic as the old fallback-catalogos snapshot.
export function capacidadSintetica(brand: string | null): { capacity_weight: number; capacity_volume: number } {
  const b = (brand || '').toLowerCase();
  if (/freightliner|nissan\s*ud|international|kenworth|paccar/.test(b)) return { capacity_weight: 8000, capacity_volume: 32 };
  if (/kia|bongo|dfsk|jmc|towner|foton/.test(b)) return { capacity_weight: 2500, capacity_volume: 12 };
  return { capacity_weight: 4500, capacity_volume: 20 }; // isuzu / toyota / hyundai / jac / mitsubishi ~ camión liviano
}

export const mapVehiculo = (row: VehiculoRow): Vehiculo => ({
  id: `eflow-veh-${row.vehicle_id}`,
  plate: row.license_plate?.trim() || `Vehículo ${row.vehicle_id}`,
  brand: (row.vehicle_brand || '').trim(),
  model: (row.unit_description || '').trim(),
  vehicle_type: '',
  ...capacidadSintetica(row.vehicle_brand),
});

// Real order line -> Pedido. No QA source distinguishes pickup/return lines
// (see doc #8), so tipo stays undefined (= 'entrega', FR16 retro-compatible).
// Missing lat/lng (~71% of clients) or weight/volume (QA has no per-line
// data, same 0 pattern as vehicle capacity) stay null/undefined rather than
// dropping the stop.
const toCoord = (v: string | null): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

export function mapPedido(row: PedidoRow, routeTypeId: string): Pedido {
  return {
    id: `eflow-ped-${row.trip_id}-${row.order_number}`,
    order_number: row.order_number,
    customer_id: row.customer_id || '',
    store_id: '',
    delivery_address: row.delivery_address || '',
    delivery_city: '',
    delivery_zone: '',
    total_weight: 0,
    total_volume: 0,
    status: 'pending',
    order_date: new Date().toISOString(),
    delivery_latitude: toCoord(row.delivery_latitude),
    delivery_longitude: toCoord(row.delivery_longitude),
    customer_name: row.customer_name || undefined,
    route_type_id: routeTypeId,
  };
}

// --- Fetchers with graceful mock fallback ----------------------------------

export async function fetchViajes(): Promise<Viaje[]> {
  const rows = await getJson<ViajeRow[]>('/api/viajes?limit=100');
  return rows.map(mapViaje); // pedidos se cargan al elegir el viaje
}

// Pedidos reales de un viaje (journey_orders -> EXPEDICIONESCABECERA). Se llama
// al ELEGIR el viaje (carga perezosa). Cae al pool mock si /api no responde o el
// viaje no trae filas reales — mismo patrón que rutas/conductores.
export async function fetchPedidosDeViaje(viajeId: string, routeTypeId: string): Promise<Pedido[]> {
  try {
    const rows = await getJson<PedidoRow[]>(`/api/viajes/${viajeId}/pedidos`);
    return rows.length ? rows.map((r) => mapPedido(r, routeTypeId)) : getFallbackPedidos(routeTypeId);
  } catch (err) {
    console.warn(`[planificacion] /api/viajes/${viajeId}/pedidos no disponible, usando mock:`, (err as Error).message);
    return getFallbackPedidos(routeTypeId);
  }
}

export async function fetchRutas(fallback: RutaTipo[]): Promise<RutaTipo[]> {
  return listOrFallback('/api/catalogos/rutas', mapRuta, fallback);
}
export async function fetchTransportistas(fallback: Transportista[]): Promise<Transportista[]> {
  return listOrFallback('/api/catalogos/transportistas', mapTransportista, fallback);
}
export async function fetchConductores(fallback: Conductor[]): Promise<Conductor[]> {
  return listOrFallback('/api/catalogos/conductores', mapConductor, fallback);
}
export async function fetchVehiculos(fallback: Vehiculo[]): Promise<Vehiculo[]> {
  return listOrFallback('/api/catalogos/vehiculos', mapVehiculo, fallback);
}

async function listOrFallback<R, T>(path: string, map: (r: R) => T, fallback: T[]): Promise<T[]> {
  try {
    const rows = await getJson<R[]>(path);
    return rows.length ? rows.map(map) : fallback;
  } catch (err) {
    console.warn(`[planificacion] ${path} no disponible, usando mock:`, (err as Error).message);
    return fallback;
  }
}
