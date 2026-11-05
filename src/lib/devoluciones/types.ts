// Tipos del módulo Devoluciones (API backend/admin: /api/v1/devoluciones/*). Un viaje = una ruta.

export type ReturnStatus = 'pending' | 'approved' | 'received' | 'completed' | 'rejected' | 'cancelled';
export type ReturnCondition = 'Bueno' | 'Dañado' | 'Incompleto';
export type ReturnKind = 'devolucion' | 'reparacion' | 'cambio';

export interface ReturnSummary {
  trips: number;
  trips_pending: number;
  trips_ready: number;
  returns_total: number;
  returns_pending: number;
  returns_received: number;
}

export interface ReturnTrip {
  route_id: string;
  route_number: string;
  route_date: string;
  plan_trip_id: string | null;
  route_status: string | null;
  driver_name: string | null;
  carrier_name: string | null;
  country_id: string | null;
  total_returns: number;
  received_returns: number;
  pending_returns: number;
  last_return_at: string | null;
  /** Formularios que ya tiene el viaje (puede ser más de uno). */
  forms_count: number;
}

export interface ReturnLine {
  id: string;
  return_number: string;
  return_type: string;
  return_date: string | null;
  reason: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number | null;
  photo_url: string | null;
  notes: string | null;
  status: ReturnStatus;
  received_at: string | null;
  received_by: string | null;
  received_quantity: number | null;
  received_condition: string | null;
  dispatch_guide_id: string;
  sequence_number: number | null;
  order_number: string | null;
  invoice_number: string | null;
  /** Formulario que ya la lleva; null = todavía sin formulario (se puede marcar para uno nuevo). */
  form_id: string | null;
  form_number: string | null;
}

/** Una parada del viaje con devoluciones: cliente y factura. Lo capturado manda sobre lo que sabe el tracking. */
export interface FormSection {
  dispatch_guide_id: string;
  sequence_number: number | null;
  invoice_number: string | null;
  customer_code: string | null;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  route_label: string | null;
  sellers: string | null;
}

export interface ReturnForm {
  id: string;
  route_id?: string;
  form_number: string;
  physical_receipt_number: string | null;
  branch: string | null;
  return_kind: ReturnKind;
  merchandise_for: string | null;
  observations: string | null;
  transport: string | null;
  guide_number: string | null;
  comments: string | null;
  received_by_name: string | null;
  received_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormSummary {
  id: string;
  form_number: string;
  created_at: string;
  updated_at: string;
  returns_count: number;
}

/** Un viaje con sus devoluciones, el borrador de secciones desde tracking y sus formularios. */
export interface TripDetail {
  trip: ReturnTrip;
  returns: ReturnLine[];
  sections: FormSection[];
  forms: FormSummary[];
  defaults: { transport: string | null };
}

/** Lo que muestra el formulario: solo las devoluciones que lleva. `form` null = formulario nuevo, sin guardar. */
export interface FormView {
  trip: ReturnTrip;
  form: ReturnForm | null;
  returns: ReturnLine[];
  sections: FormSection[];
  defaults: { transport: string | null };
}

export type TripFilter = 'pendientes' | 'recibidos' | 'todos';

/** Lo que se edita en el formulario: todo como texto de input. */
export interface SectionDraft {
  dispatch_guide_id: string;
  invoice_number: string;
  customer_code: string;
  customer_name: string;
  phone: string;
  address: string;
  route_label: string;
  sellers: string;
}

export interface FormDraft {
  physical_receipt_number: string;
  branch: string;
  return_kind: ReturnKind;
  merchandise_for: string;
  observations: string;
  transport: string;
  guide_number: string;
  comments: string;
  received_by_name: string;
  received_date: string;
  sections: SectionDraft[];
}
