// Contrato de /api/v1/tracking/* (backend/tracking). Un solo juego de tipos para toda la pantalla.

export type RouteState = 'planned' | 'active' | 'completed' | 'cancelled' | 'unknown';
export type Signal = 'online' | 'stale' | 'offline' | 'none';
export type MapColor = 'green' | 'amber' | 'gray' | 'blue';
export type StopState = 'pending' | 'delivered' | 'failed';
export type EvidenceKind = 'photo_invoice' | 'signature' | 'photo_other';

export interface Position {
  lat: number;
  lng: number;
  speed_mps: number | null;
  heading_deg: number | null;
  battery_pct: number | null;
  recorded_at: string;
}

export interface Progress {
  total: number;
  done: number;
  delivered: number;
  failed: number;
  percent: number;
}

export interface Viaje {
  id: string;
  route_number: string;
  state: RouteState;
  status_raw: string | null;
  signal: Signal;
  color: MapColor;
  driver_name: string | null;
  plate: string | null;
  carrier_name: string | null;
  zone_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  route_date: string | null;
  position: Position | null;
  progress: Progress;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  mime_type: string;
  captured_at: string | null;
  url: string;
}

export interface StopReturn {
  id: string;
  return_number: string;
  return_type: string;
  reason: string;
  product_name: string | null;
  quantity: number | null;
  status: string | null;
  notes: string | null;
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
  items: number | null;
  weight: number | null;
  lat: number | null;
  lng: number | null;
  arrived_at: string | null;
  recipient_name: string | null;
  evidences: Evidence[];
  incidents: { at: string; text: string | null }[];
  returns: StopReturn[];
}

export interface TripEvent {
  id: string;
  type: string;
  status: string;
  at: string;
  notes: string | null;
  stop_id: string | null;
}

export interface ViajeDetalle extends Viaje {
  stops: Stop[];
  events: TripEvent[];
  trail: { lat: number; lng: number; at: string }[];
}

export interface ViajePlanificado {
  plan_trip_id: string;
  plan_date: string;
  zone: string | null;
  plate: string | null;
  driver_name: string | null;
  stops: number;
}

export interface ViajesPage {
  items: Viaje[];
  next_cursor: string | null;
}
