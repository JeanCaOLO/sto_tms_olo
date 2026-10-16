// Fuente de datos del módulo Tracking. Hoy SOLO datos locales (data/viajes-demo.json, ver local-store.ts):
// no llama a /api. Para volver al backend real, cambia DATASOURCE a 'api' (cliente en api-remote.ts).
import * as remote from './api-remote';
import * as store from './local-store';
import type { ListMode } from './types';

const DATASOURCE: 'local' | 'api' = 'local';
const local = DATASOURCE === 'local';

export { TrackingApiError } from './api-remote';
export { SPEEDS } from './local-store';

/** true = datos locales con simulación (velocidad/pausa disponibles). */
export const IS_LOCAL = local;
/** Hora de la simulación (en datos locales avanza con la velocidad elegida; en API es la real). */
export const clockNow = (): number => (local ? store.simNow() : Date.now());
export const getSimulation = () => store.getSimulation();
export const setSimulation = (patch: { speed?: number; paused?: boolean }) => store.setSimulation(patch);
export interface ListParams {
  mode: ListMode;
  q: string;
  limit: number;
  /** ISO del país del selector global; null = todos. Solo lo usa la fuente local (el backend filtra por permisos). */
  country?: string | null;
}

export const listViajes = async (p: ListParams) => (local ? store.localList(p.mode, p.q, p.limit, p.country ?? null) : remote.listViajes(p));
export const getViaje = async (id: string) => (local ? store.localDetail(id) : remote.getViaje(id));
export const getResumen = async (country: string | null = null) => (local ? store.localSummary(country) : remote.getResumen());
export const revisarViaje = async (id: string, note?: string) => (local ? store.localReview(id, note) : remote.revisarViaje(id, note));
export const listPlanificados = async (country: string | null = null) => (local ? store.localPlanned(country) : remote.listPlanificados());
export const iniciarViaje = async (planTripId: string) => (local ? store.localStart(planTripId) : remote.iniciarViaje(planTripId));
export const completarViaje = async (id: string, force = false) => (local ? store.localComplete(id, force) : remote.completarViaje(id, force));
