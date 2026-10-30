// Cliente de /api/v1/tracking/*. Siempre habla el contrato del backend (backend/tracking). En modo mock (solo
// DEV, sin túnel a Aurora) `mock/installTrackingMock.ts` cambia el transporte por un backend simulado que
// responde ese mismo contrato, igual que el tarifador (ver src/lib/tarifas/data/memory/installMock.ts).
import { apiFetch } from '../../lib/supabase';
import type { ChoferEnLinea, ListMode, ViajeDetalle, ViajePlanificado, ViajesPage } from './types';

export class TrackingApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = NonNullable<Parameters<typeof fetch>[1]>;
export type TrackingTransport = (path: string, init?: RequestOptions) => Promise<{ ok: boolean; status: number; body: any }>;

// 5 s: el chofer que inicia o cierra sesión, o recupera la señal, se ve casi en tiempo real. El resumen (KPIs) del
// backend se cachea 5 s, así que varias pantallas abiertas no multiplican ese cálculo.
const POLL_MS = 10_000; // el chofer reporta cada ~30 s: refrescar más seguido solo gasta Lambda/Aurora
const MOCK_POLL_MS = 3_000;

let transport: TrackingTransport = apiFetch;
let mock = false;
let clock: () => number = Date.now;

/** Lo usa solo el modo mock: reemplaza el transporte HTTP (y el reloj, que allí es simulado y acelerado). */
export function setTrackingTransport(next: TrackingTransport, mockClock?: () => number) {
  transport = next;
  mock = mockClock !== undefined;
  clock = mockClock ?? Date.now;
}

/** true en modo mock (datos de prueba): solo entonces se ven simulación e "Iniciar viaje". */
export const isTrackingMock = () => mock;
/** "Ahora" para calcular antigüedades ("hace X"): el real, o el simulado en modo mock. */
export const trackingNow = () => clock();
/** Cada cuánto se refresca: 5 s contra el backend; 3 s en mock para ver avanzar la simulación. */
export const pollIntervalMs = () => (mock ? MOCK_POLL_MS : POLL_MS);

async function call<T>(path: string, init?: RequestOptions): Promise<T> {
  const res = await transport(`/v1/tracking${path}`, init);
  if (!res.ok || res.body?.error) {
    throw new TrackingApiError(res.body?.error?.message ?? `HTTP ${res.status}`, res.status);
  }
  return res.body.data as T;
}

export interface ListParams {
  mode: ListMode;
  q: string;
  limit: number;
  cursor?: string | null;
  /** Código ISO del país del selector global; null = todos los del rol. */
  country?: string | null;
  /** Pide también los KPIs (solo en la primera página). */
  summary?: boolean;
}

export function listViajes(p: ListParams, signal?: AbortSignal): Promise<ViajesPage> {
  const params = new URLSearchParams({ limit: String(p.limit) });
  if (p.mode === 'active') params.set('activos', '1');
  if (p.q.trim()) params.set('q', p.q.trim());
  if (p.cursor) params.set('cursor', p.cursor);
  if (p.country) params.set('pais', p.country);
  if (p.summary) params.set('include', 'summary');
  return call<ViajesPage>(`/viajes?${params}`, { signal });
}

export const getViaje = (id: string, signal?: AbortSignal) => call<ViajeDetalle>(`/viajes/${encodeURIComponent(id)}`, { signal });

/** Choferes con la app abierta (con o sin viaje). Solo administrador; `country` = código ISO o null (todos los del rol). */
export const listChoferes = (country: string | null = null, signal?: AbortSignal) =>
  call<ChoferEnLinea[]>(`/choferes${country ? `?pais=${encodeURIComponent(country)}` : ''}`, { signal });

// Solo modo mock: el inicio real del viaje lo reporta la app del chofer / Planificación.
export const listPlanificados = (country: string | null = null) =>
  call<ViajePlanificado[]>(`/planificados${country ? `?pais=${encodeURIComponent(country)}` : ''}`);
export const iniciarViaje = (planTripId: string) =>
  call<{ route_id: string; created: boolean }>(`/viajes/${encodeURIComponent(planTripId)}/iniciar`, { method: 'POST', body: '{}' });

/** Clave i18n para un error del API (el texto del backend viene en español; la UI puede estar en inglés). */
export function errorKey(err: unknown): string {
  const status = err instanceof TrackingApiError ? err.status : 0;
  if (status === 404) return 'tracking.errorNotFound';
  if (status === 403 || status === 401) return 'tracking.errorForbidden';
  if (status === 409) return 'tracking.errorConflict';
  return 'tracking.errorGeneric';
}
