// Contrato de /api/v1/tracking/* (backend/tracking). Un solo juego de tipos para toda la pantalla.
// Tracking solo MONITOREA: no hay acciones sobre el viaje (eso es de Planificación).

export type RouteState = 'planned' | 'active' | 'completed' | 'cancelled' | 'unknown';
export type Signal = 'online' | 'stale' | 'offline' | 'none';
export type MapColor = 'green' | 'amber' | 'gray' | 'blue';
export type StopState = 'pending' | 'delivered' | 'failed';
/** Evidencias de entrega: solo foto de la factura firmada y firma digital. */
export type EvidenceKind = 'photo_invoice' | 'signature';
export type Phase = 'por_salir' | 'en_ruta';
export type AlertCode = 'failed' | 'no_signal' | 'late' | 'stopped';
export type ListMode = 'active' | 'all';

export interface TripAlert {
  code: AlertCode;
  count?: number;
}

export interface Position {
  lat: number;
  lng: number;
  speed_mps: number | null;
  recorded_at: string;
}

export interface Progress {
  total: number;
  done: number;
  delivered: number;
  failed: number;
  percent: number;
}

/** Presencia del chofer en la app móvil (login / latido / logout). `null`: nunca abrió la app. */
export interface Presencia {
  status: 'online' | 'offline';
  last_seen_at: string | null;
}

/** Chofer con la app abierta en los últimos 30 min (GET /tracking/choferes). `route_id` null = en línea sin viaje. */
export interface ChoferEnLinea {
  driver_id: string;
  driver_name: string | null;
  country: string | null;
  signal: Signal;
  last_seen_at: string | null;
  battery_pct: number | null;
  route_id: string | null;
}

export interface Viaje {
  id: string;
  route_number: string;
  state: RouteState;
  phase: Phase | null;
  signal: Signal;
  color: MapColor;
  driver_name: string | null;
  plate: string | null;
  zone_name: string | null;
  /** Código ISO del país del viaje (CR, VN...). */
  country: string | null;
  /** Zona horaria IANA del país: las horas se muestran en la hora del viaje, no la del navegador. */
  timezone: string | null;
  started_at: string | null;
  ended_at: string | null;
  planned_end_at: string | null;
  route_date: string | null;
  /** Fecha límite de entrega (YYYY-MM-DD, la de Planificación). */
  due_date: string | null;
  /** Cuándo se asignó el viaje (se creó en Planificación). */
  assigned_at: string | null;
  /** Días pasados de la fecha límite (0 = en plazo o ya cerrado). El retraso se mide por día de entrega. */
  days_late: number;
  position: Position | null;
  progress: Progress;
  delay_min: number | null;
  alerts: TripAlert[];
  /** Presencia del chofer en la app; opcional por compatibilidad con respuestas anteriores. */
  presence?: Presencia | null;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  mime_type: string;
  captured_at: string | null;
  url: string | null;
}

export interface Stop {
  id: string;
  guide_number: string;
  sequence: number;
  state: StopState;
  order_number: string;
  invoice_number: string | null;
  customer_name: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  arrived_at: string | null;
  recipient_name: string | null;
  evidences: Evidence[];
  planned_arrival_at: string | null;
  distance_m: number | null;
  eta_at: string | null;
  delay_min: number | null;
}

export interface ViajeDetalle extends Viaje {
  origin: { lat: number; lng: number; name: string | null } | null;
  next_stop_id: string | null;
  departed_at: string | null;
  stops: Stop[];
}

export interface ViajePlanificado {
  plan_trip_id: string;
  plan_date: string;
  zone: string | null;
  plate: string | null;
  driver_name: string | null;
  stops: number;
}

/** KPIs por VIAJE (lo que se ve de un vistazo). */
export interface Resumen {
  active: number;
  on_time: number;
  late: number;
  no_signal: number;
  completed_today: number;
  /** Paradas de los viajes en curso: entregadas/fallidas y faltantes (se actualiza con el polling). */
  deliveries_total?: number;
  deliveries_done?: number;
  deliveries_remaining?: number;
}

export interface ViajesPage {
  items: Viaje[];
  next_cursor: string | null;
  summary?: Resumen;
}
