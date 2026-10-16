// Reglas puras de presentación del tracking (sin React): colores, etiquetas y tiempos relativos.
import type { MapColor, RouteState, Signal, StopState, Viaje } from './types';

export const COLOR_HEX: Record<MapColor, string> = {
  green: '#059669',
  amber: '#d97706',
  gray: '#64748b',
  blue: '#0284c7',
};

export const STOP_COLOR_HEX: Record<StopState, string> = {
  pending: '#94a3b8',
  delivered: '#059669',
  failed: '#dc2626',
};

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export function stateVariant(state: RouteState, signal: Signal): BadgeVariant {
  if (state === 'completed') return 'info';
  if (state === 'active') return signal === 'online' ? 'success' : signal === 'stale' ? 'warning' : 'danger';
  if (state === 'cancelled') return 'danger';
  return 'default';
}

export function stopVariant(state: StopState): BadgeVariant {
  return state === 'delivered' ? 'success' : state === 'failed' ? 'danger' : 'default';
}

/** Segundos desde `iso` hasta `now`; null si no hay fecha válida. */
export function ageSeconds(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  return Number.isNaN(then) ? null : Math.max(0, Math.round((now - then) / 1000));
}

/** "hace 30 s", "hace 5 min", "hace 2 h", "hace 3 d" (texto corto, sin i18n: unidades universales). */
export function formatAge(iso: string | null | undefined, now: number): string | null {
  const seconds = ageSeconds(iso, now);
  if (seconds === null) return null;
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} d`;
}

export function isActive(viaje: Pick<Viaje, 'state'>): boolean {
  return viaje.state === 'active';
}

/** Viajes con coordenadas para el mapa. */
export function positioned(viajes: Viaje[]): Viaje[] {
  return viajes.filter((v) => v.position !== null);
}

export function speedKmh(mps: number | null | undefined): number | null {
  return mps == null ? null : Math.round(mps * 3.6);
}

// Claves i18n (tracking.*) por estado, para que los componentes no repitan el mapeo.
export const STATE_KEY: Record<RouteState, string> = {
  planned: 'tracking.statePlanned',
  active: 'tracking.stateActive',
  completed: 'tracking.stateCompleted',
  cancelled: 'tracking.stateCancelled',
  unknown: 'tracking.stateUnknown',
};

export const STOP_KEY: Record<StopState, string> = {
  pending: 'tracking.stopPending',
  delivered: 'tracking.stopDelivered',
  failed: 'tracking.stopFailed',
};

export const EVIDENCE_KEY: Record<string, string> = {
  photo_invoice: 'tracking.evidenceInvoice',
  signature: 'tracking.evidenceSignature',
  photo_other: 'tracking.evidenceOther',
};

/** Un viaje en tránsito sin paradas pendientes está listo para cerrarse. */
export function readyToComplete(viaje: Pick<Viaje, 'state' | 'progress'>): boolean {
  return viaje.state === 'active' && viaje.progress.total > 0 && viaje.progress.done >= viaje.progress.total;
}
