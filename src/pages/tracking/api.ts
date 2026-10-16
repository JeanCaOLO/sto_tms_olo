// Fuente de datos del módulo Tracking. Hoy SOLO datos locales (data/viajes-demo.json, ver local-store.ts):
// no llama a /api. Para volver al backend real, cambia DATASOURCE a 'api' (cliente en api-remote.ts).
import * as remote from './api-remote';
import * as store from './local-store';
import type { ListMode } from './types';

const DATASOURCE: 'local' | 'api' = 'local';
const local = DATASOURCE === 'local';

export { TrackingApiError } from './api-remote';
export interface ListParams {
  mode: ListMode;
  q: string;
  limit: number;
}

export const listViajes = async (p: ListParams) => (local ? store.localList(p.mode, p.q, p.limit) : remote.listViajes(p));
export const getViaje = async (id: string) => (local ? store.localDetail(id) : remote.getViaje(id));
export const getResumen = async () => (local ? store.localSummary() : remote.getResumen());
export const revisarViaje = async (id: string, note?: string) => (local ? store.localReview(id, note) : remote.revisarViaje(id, note));
export const listPlanificados = async () => (local ? store.localPlanned() : remote.listPlanificados());
export const iniciarViaje = async (planTripId: string) => (local ? store.localStart(planTripId) : remote.iniciarViaje(planTripId));
export const completarViaje = async (id: string, force = false) => (local ? store.localComplete(id, force) : remote.completarViaje(id, force));
