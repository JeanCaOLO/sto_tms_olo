export interface Pedido {
  id: string;
  order_number: string;
  customer_id: string;
  store_id: string;
  delivery_address: string;
  delivery_city: string;
  delivery_zone: string;
  total_weight: number;
  total_volume: number;
  status: string;
  order_date: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  customer_name?: string;
  store_name?: string;
  route_type_id?: string;
  // Dirección de entrega distinta a la registrada del cliente (hoy llega
  // como comentario libre en Iflow, sin coordenadas — ver Reunión
  // 2026-08-18). Sin lat/lng, queda fuera del cálculo de ruta óptima.
  is_exception?: boolean;
  exception_address_raw?: string;
}

// Agrupador de pedidos que llega ya resuelto desde el WMS (Iflow/torre de
// control): n pedidos + n destinos, con la ruta ya asignada. El TMS consume
// esa asignación viaje→ruta como fuente de verdad, no la recalcula (ver
// Reunión 2026-08-18 — Planificación de Rutas con Ricardo).
export interface Viaje {
  id: string;
  trip_number: string;
  route_type_id: string;
  route_type_name: string;
  trip_date: string;
  status: 'despachado' | 'planificado' | 'en_ruta' | 'completado' | 'anulado';
  pedidos: Pedido[];
}

export interface PedidoSeleccionado extends Pedido {
  stop_number: number;
  /** ETA in minutes from midnight (e.g. 510 = 8:30). -1 = sin coordenadas. */
  eta_min?: number;
  /** True if eta_min > ventana de entrega (19:00 default). */
  outside_window?: boolean;
}

export interface Vehiculo {
  id: string;
  plate: string;
  brand: string;
  model: string;
  vehicle_type: string;
  capacity_weight: number;
  capacity_volume: number;
}

export interface Conductor {
  id: string;
  full_name: string;
  document: string;
  carrier_id: string;
}

export interface Transportista {
  id: string;
  name: string;
}

export interface RutaTipo {
  id: string;
  name: string;
}
