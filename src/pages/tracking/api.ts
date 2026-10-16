// Cliente de /api/v1/tracking/*. `apiFetch` antepone /api, envía el JWT y el contexto operativo.
import { apiFetch } from '../../lib/supabase';
import type { ListMode, Resumen, ViajeDetalle, ViajePlanificado, ViajesPage } from './types';

export class TrackingApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: Parameters<typeof apiFetch>[1]): Promise<T> {
  const res = await apiFetch(`/v1/tracking${path}`, init);
  if (!res.ok || res.body?.error) {
    throw new TrackingApiError(res.body?.error?.message ?? `HTTP ${res.status}`, res.status);
  }
  return res.body.data as T;
}

export interface ListParams {
  mode: ListMode;
  q: string;
  limit: number;
}

export function listViajes({ mode, q, limit }: ListParams): Promise<ViajesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (mode === 'active') params.set('activos', '1');
  if (mode === 'review') params.set('por_revisar', '1');
  if (q.trim()) params.set('q', q.trim());
  return call<ViajesPage>(`/viajes?${params}`);
}

export const getViaje = (id: string) => call<ViajeDetalle>(`/viajes/${id}`);
export const getResumen = () => call<Resumen>('/resumen');
export const revisarViaje = (id: string, note?: string) =>
  call<{ route_id: string }>(`/viajes/${id}/revisar`, { method: 'POST', body: JSON.stringify(note ? { note } : {}) });
export const listPlanificados = () => call<ViajePlanificado[]>('/planificados');
export const iniciarViaje = (planTripId: string) =>
  call<{ route_id: string; created: boolean }>(`/viajes/${planTripId}/iniciar`, { method: 'POST', body: '{}' });
export const completarViaje = (id: string, force = false) =>
  call<{ route_id: string; pending: number }>(`/viajes/${id}/completar`, { method: 'POST', body: JSON.stringify({ force }) });
