// Cliente de /api/v1/tracking/*. `apiFetch` antepone /api, envía el JWT y el contexto operativo.
import { apiFetch } from '../../lib/supabase';
import type { ViajeDetalle, ViajePlanificado, ViajesPage } from './types';

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
  activos: boolean;
  q: string;
  limit: number;
}

export function listViajes({ activos, q, limit }: ListParams): Promise<ViajesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (activos) params.set('activos', '1');
  if (q.trim()) params.set('q', q.trim());
  return call<ViajesPage>(`/viajes?${params}`);
}

export const getViaje = (id: string) => call<ViajeDetalle>(`/viajes/${id}`);
export const listPlanificados = () => call<ViajePlanificado[]>('/planificados');
export const iniciarViaje = (planTripId: string) =>
  call<{ route_id: string; created: boolean }>(`/viajes/${planTripId}/iniciar`, { method: 'POST', body: '{}' });
export const completarViaje = (id: string, force = false) =>
  call<{ route_id: string; pending: number }>(`/viajes/${id}/completar`, { method: 'POST', body: JSON.stringify({ force }) });
