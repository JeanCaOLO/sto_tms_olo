// Reglas puras de presentación del tracking (sin React): colores, etiquetas y tiempos relativos.
import type { AlertCode, MapColor, ReviewColor, ReviewReasonCode, RouteState, Signal, Stop, StopState, Viaje } from './types';

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
  if (state === 'active') return signal === 'online' ? 'success' : signal === 'stale' ? 'warning' : signal === 'offline' ? 'danger' : 'default';
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

// --- alertas, retraso, cercanía y semáforo -----------------------------------------------------------

export const ALERT_META: Record<AlertCode, { key: string; icon: string; cls: string }> = {
  incident: { key: 'tracking.alertIncident', icon: 'ri-chat-warning-line', cls: 'bg-amber-100 text-amber-800' },
  failed: { key: 'tracking.alertFailed', icon: 'ri-close-circle-line', cls: 'bg-red-100 text-red-700' },
  no_signal: { key: 'tracking.alertNoSignal', icon: 'ri-signal-wifi-off-line', cls: 'bg-slate-200 text-slate-700' },
  late: { key: 'tracking.alertLate', icon: 'ri-time-line', cls: 'bg-red-100 text-red-700' },
  stopped: { key: 'tracking.alertStopped', icon: 'ri-pause-circle-line', cls: 'bg-amber-100 text-amber-800' },
};

export const REVIEW_HEX: Record<ReviewColor, string> = { green: '#059669', amber: '#d97706', red: '#dc2626' };
export const REVIEW_KEY: Record<ReviewColor, string> = {
  green: 'tracking.reviewGreen',
  amber: 'tracking.reviewAmber',
  red: 'tracking.reviewRed',
};
export const REVIEW_REASON_KEY: Record<ReviewReasonCode, string> = {
  failed: 'tracking.reasonFailed',
  missing_evidence: 'tracking.reasonMissingEvidence',
  incidents: 'tracking.reasonIncidents',
  pickups: 'tracking.reasonPickups',
  returns: 'tracking.reasonReturns',
  late: 'tracking.reasonLate',
};

/** "850 m" / "12.4 km"; null si no hay distancia. */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** Hora local "HH:MM" de un ISO; null si no es válido. */
export function formatClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Retraso en minutos → variante de badge: ≤15 a tiempo, ≤60 aviso, más peligro; null sin dato. */
export function delayVariant(min: number | null | undefined): BadgeVariant {
  if (min == null) return 'default';
  if (min > 60) return 'danger';
  if (min > 15) return 'warning';
  return 'success';
}

/** Paradas pendientes de la más cercana a la más lejana (sin distancia, al final y por secuencia). */
export function nearestPending(stops: Stop[]): Stop[] {
  return stops
    .filter((s) => s.state === 'pending')
    .sort((a, b) => {
      if (a.distance_m == null && b.distance_m == null) return a.sequence - b.sequence;
      if (a.distance_m == null) return 1;
      if (b.distance_m == null) return -1;
      return a.distance_m - b.distance_m;
    });
}

/** Enlaces para abrir la parada en Google Maps o Waze (navegación externa, sin llave de API). */
export function navigationLinks(lat: number | null, lng: number | null): { maps: string; waze: string } | null {
  if (lat == null || lng == null) return null;
  return {
    maps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}
