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
}

export interface PedidoSeleccionado extends Pedido {
  stop_number: number;
}

export interface Vehiculo {
  id: string;
  plate: string;
  type: string;
  capacity_kg: number;
  capacity_m3: number;
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
