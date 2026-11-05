import { currentAccessToken, expireSession, isTokenRejected } from '../../lib/api-client';
import type { Conductor, Pedido, RutaTipo, Transportista, Vehiculo, Viaje } from './types';
import { getFallbackPedidos } from './fallback-pedidos';
import { mockFallbackEnabled } from './mock-fallback';
import {
  mapConductor,
  mapPedido,
  mapRuta,
  mapTransportista,
  mapVehiculo,
  mapViaje,
  type PedidoRow,
  type ViajeRow,
} from './eflow-mappers';

// Re-export de las formas de fila + mappers para no romper imports existentes
// (componentes y tests importan estos desde './eflow-api').
export * from './eflow-mappers';

// Thin client for the read-only EFLOW API (`server/` en dev, API Gateway en
// prod). En dev, Vite proxya /api/* -> http://localhost:4000 (`pnpm server`).
// En desarrollo cada llamada cae al mock curado si /api no responde, así el módulo funciona
// offline. En producción el error se propaga (ver mock-fallback.ts).

const TIMEOUT_MS = 4000;

// Base del API. Vacío en dev: Vite proxya /api/* -> localhost:4000 (`pnpm server`).
// En build se setea VITE_API_BASE a la URL del API desplegado (API Gateway), p.ej.
// https://<id>.execute-api.us-east-1.amazonaws.com/<env>. Sin barra final.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

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
    // El API exige el JWT del TMS (server/index.mjs). Sin sesión no se manda cabecera y responde 401.
    const token = currentAccessToken();
    const res = await fetch(API_BASE + conPais(path), {
      signal: ctrl.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (token && (res.status === 401 || res.status === 403)) {
      const body = await res.clone().json().catch(() => null);
      if (isTokenRejected(res.status, body)) expireSession(token);
    }
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
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
  let rows: PedidoRow[];
  try {
    rows = await getJson<PedidoRow[]>(`/api/viajes/${viajeId}/pedidos`);
  } catch (err) {
    if (!mockFallbackEnabled()) throw err;
    console.warn(`[planificacion] /api/viajes/${viajeId}/pedidos no disponible, usando mock:`, (err as Error).message);
    return getFallbackPedidos(routeTypeId);
  }
  if (rows.length) return rows.map((r) => mapPedido(r, routeTypeId));
  return mockFallbackEnabled() ? getFallbackPedidos(routeTypeId) : [];
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

// Matriz de días de despacho por ruta (EFLOW RUTA_DIA_AB). `day_ids` = CSV de
// ID_DIA (1=Lunes … 7=Domingo). Sin fallback mock: la matriz muestra el estado real.
export interface RutaDiaRow {
  route_code: string;
  route_name: string | null;
  day_ids: string | null;
  promesa_horas: number | string | null;
}
export function fetchRutasDias(): Promise<RutaDiaRow[]> {
  return getJson<RutaDiaRow[]>('/api/catalogos/rutas-dias');
}

async function listOrFallback<R, T>(path: string, map: (r: R) => T, fallback: T[]): Promise<T[]> {
  let rows: R[];
  try {
    rows = await getJson<R[]>(path);
  } catch (err) {
    if (!mockFallbackEnabled()) throw err;
    console.warn(`[planificacion] ${path} no disponible, usando mock:`, (err as Error).message);
    return fallback;
  }
  if (rows.length) return rows.map(map);
  return mockFallbackEnabled() ? fallback : [];
}
