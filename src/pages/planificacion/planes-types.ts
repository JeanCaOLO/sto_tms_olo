// Modelo del plan de rutas PERSISTIDO (contrato maestro §1/§4). A diferencia de
// ViajePropuesto (motor cliente, efímero), estas formas son las que devuelve el
// backend Aurora: un route_plan con estado + sus plan_trips y plan_stops. El
// frontend pide, renderiza y edita; el motor (zona+capacidad+2opt) vive en el
// dominio backend. Mientras el backend no exista, planes-mock.ts las produce.

export type PlanStatus = 'draft' | 'confirmed' | 'completed' | 'cancelled';

// Transiciones válidas (§1): draft→confirmed; confirmed→completed|cancelled.
// Nada vuelve a draft. Solo un plan draft es editable.
export const TRANSICIONES: Record<PlanStatus, PlanStatus[]> = {
  draft: ['confirmed'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// Una parada = un pedido dentro de un viaje, en secuencia (plan_stops).
export interface PlanStop {
  id: string;
  order_id: string;
  stop_order: number;
  // Datos del pedido para render (el backend los incluye embebidos o el mock
  // los arrastra del Pedido original). Peso/volumen null = desconocido.
  order_number: string;
  customer_name: string | null;
  delivery_city: string | null;
  delivery_zone: string | null;
  // Coords del punto de entrega (para el mapa) — el backend las embebe.
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  total_weight: number | null;
  total_volume: number | null;
}

// Un viaje = un camión dentro del plan (plan_trips).
// Estado de un viaje (plan_trip), independiente del estado del plan.
export type TripStatus = 'pending' | 'completed' | 'cancelled';

export interface PlanTrip {
  id: string;
  status: TripStatus;
  vehicle_id: string;
  driver_id: string | null;
  delivery_zone: string;
  sequence_order: number;
  total_weight: number | null;
  total_volume: number | null;
  // Datos del vehículo para render y barras de capacidad.
  vehicle_plate: string;
  vehicle_label: string; // marca + modelo
  vehicle_capacity_weight: number;
  vehicle_capacity_volume: number;
  is_flota_propia: boolean;
  stops: PlanStop[];
}

// Cabecera de una planificación de un día (route_plans).
export interface RoutePlan {
  id: string;
  country_id: string | null;
  warehouse_id: string | null;
  plan_date: string; // YYYY-MM-DD
  status: PlanStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  trips: PlanTrip[];
  // Pedidos que el motor no pudo acomodar en un viaje (sin vehículo libre).
  unassigned_order_numbers: string[];
}

// Cuerpo del PUT de edición: mover pedidos entre viajes / sacar-agregar.
// El server revalida capacidad y recalcula secuencia; el front manda la nueva
// composición de viajes (qué order_ids van en cada trip, y en qué orden).
export interface PlanEditPayload {
  trips: { id: string; order_ids: string[] }[];
}
