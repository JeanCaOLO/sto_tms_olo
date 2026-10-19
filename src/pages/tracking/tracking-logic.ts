// Reglas puras de presentación del tracking (sin React): colores, etiquetas y tiempos relativos.
// Los umbrales (señal, retraso, detenido) viven SOLO en el backend: la UI pinta `signal`, `color` y `alerts`.
import type { AlertCode, EvidenceKind, MapColor, RouteState, Signal, StopState, Viaje } from './types';

export const COLOR_HEX: Record<MapColor, string> = {
  green: '#059669',
  amber: '#d97706',
  gray: '#64748b',
  blue: '#0284c7',
};

export const STOP_COLOR_HEX: Record<StopState, string> = {
  pending: '#7c3aed',
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

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Antigüedad corta y traducida: "30 s", "5 min", "2 h", "3 d"; null sin fecha. */
export function formatAge(iso: string | null | undefined, now: number, t: Translate): string | null {
  const seconds = ageSeconds(iso, now);
  if (seconds === null) return null;
  if (seconds < 60) return t('tracking.ageSeconds', { count: seconds });
  if (seconds < 3600) return t('tracking.ageMinutes', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('tracking.ageHours', { count: Math.floor(seconds / 3600) });
  return t('tracking.ageDays', { count: Math.floor(seconds / 86400) });
}

/** Viajes con coordenadas para el mapa. */
export function positioned(viajes: Viaje[]): Viaje[] {
  return viajes.filter((v) => v.position !== null);
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

export const EVIDENCE_KEY: Record<EvidenceKind, string> = {
  photo_invoice: 'tracking.evidenceInvoice',
  signature: 'tracking.evidenceSignature',
};

export const ALERT_META: Record<AlertCode, { key: string; icon: string; cls: string }> = {
  failed: { key: 'tracking.alertFailed', icon: 'ri-close-circle-line', cls: 'bg-red-100 text-red-700' },
  no_signal: { key: 'tracking.alertNoSignal', icon: 'ri-signal-wifi-off-line', cls: 'bg-slate-200 text-slate-700' },
  late: { key: 'tracking.alertLate', icon: 'ri-time-line', cls: 'bg-red-100 text-red-700' },
  stopped: { key: 'tracking.alertStopped', icon: 'ri-pause-circle-line', cls: 'bg-amber-100 text-amber-800' },
};

/** "850 m" / "12.4 km"; null si no hay distancia. */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters == null) return null;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** Hora "HH:MM" de un ISO en la zona del viaje (la del país); sin zona, la del navegador. null si no es válido. */
export function formatClock(iso: string | null | undefined, timezone?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone ?? undefined });
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}

/** Retraso del viaje (minutos) si el backend lo marcó como alerta; null si va a tiempo. */
export function lateMinutes(viaje: Pick<Viaje, 'alerts'>): number | null {
  const late = viaje.alerts.find((a) => a.code === 'late');
  return late ? late.count ?? null : null;
}

// --- filtro rápido desde los KPIs (por viaje) ---------------------------------------------------------

export type KpiFilter = 'active' | 'on_time' | 'late' | 'no_signal' | 'completed_today';

/** Fecha local (YYYY-MM-DD) de un instante en la zona dada (o la del navegador). */
function localDate(ms: number, timezone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  }
}

/** ¿El viaje entra en el KPI elegido? Misma definición que los conteos del backend. */
export function matchesKpi(viaje: Viaje, kpi: KpiFilter, now: number): boolean {
  const has = (code: AlertCode) => viaje.alerts.some((a) => a.code === code);
  switch (kpi) {
    case 'active': return viaje.state === 'active';
    case 'late': return viaje.state === 'active' && has('late');
    case 'on_time': return viaje.state === 'active' && !has('late');
    case 'no_signal': return viaje.state === 'active' && has('no_signal');
    case 'completed_today': {
      if (viaje.state !== 'completed' || !viaje.ended_at) return false;
      const ended = Date.parse(viaje.ended_at);
      return !Number.isNaN(ended) && localDate(ended, viaje.timezone) === localDate(now, viaje.timezone);
    }
    default: return true;
  }
}
