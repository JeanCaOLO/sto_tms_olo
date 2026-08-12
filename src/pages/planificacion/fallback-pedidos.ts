import type { Pedido } from './types';

type MockStop = Pick<
  Pedido,
  'customer_name' | 'delivery_address' | 'delivery_city' | 'delivery_zone' | 'delivery_latitude' | 'delivery_longitude' | 'total_weight' | 'total_volume'
>;

// Real Gran Área Metropolitana (Costa Rica) addresses/coords, no live client data.
const MOCK_STOPS: MockStop[] = [
  { customer_name: 'Supermercado Central', delivery_address: 'Calle Huérfanos 1178', delivery_city: 'San José', delivery_zone: 'GAM Centro', delivery_latitude: 9.9333, delivery_longitude: -84.0833, total_weight: 320, total_volume: 1.8 },
  { customer_name: 'Minimarket Las Condes', delivery_address: 'Av. Vitacura 2939', delivery_city: 'Escazú', delivery_zone: 'GAM Oriente', delivery_latitude: 9.9189, delivery_longitude: -84.1436, total_weight: 185.5, total_volume: 1.2 },
  { customer_name: 'Almacén Maipú', delivery_address: 'Calle Central 450', delivery_city: 'Alajuela', delivery_zone: 'GAM Norte', delivery_latitude: 10.0162, delivery_longitude: -84.2116, total_weight: 450, total_volume: 2.5 },
  { customer_name: 'Distribuidora Norte', delivery_address: 'Av. Reyes Católicos 1020', delivery_city: 'Heredia', delivery_zone: 'GAM Norte', delivery_latitude: 9.9989, delivery_longitude: -84.1174, total_weight: 210, total_volume: 1.4 },
  { customer_name: 'Comercial Sur', delivery_address: 'Av. Vicuña Mackenna 6100', delivery_city: 'Cartago', delivery_zone: 'GAM Sur', delivery_latitude: 9.8644, delivery_longitude: -83.9194, total_weight: 380, total_volume: 2.1 },
  { customer_name: 'Bodega Curridabat', delivery_address: 'Calle 41, 200m sur', delivery_city: 'Curridabat', delivery_zone: 'GAM Sur', delivery_latitude: 9.9167, delivery_longitude: -84.0333, total_weight: 275, total_volume: 1.6 },
  { customer_name: 'Ferretería Desamparados', delivery_address: 'Av. Central, frente a la iglesia', delivery_city: 'Desamparados', delivery_zone: 'Rural Sur', delivery_latitude: 9.8983, delivery_longitude: -84.0633, total_weight: 520, total_volume: 3.0 },
  { customer_name: 'Pulpería San Rafael', delivery_address: 'Calle Real 80', delivery_city: 'San Rafael', delivery_zone: 'Rural Norte', delivery_latitude: 10.0500, delivery_longitude: -84.0833, total_weight: 140, total_volume: 0.9 },
];

// ponytail: deterministic synthetic stops keyed only by route_type_id (not a
// per-route distinct dataset — that's more than a prototype needs). Used as
// fallback when the real `orders` query returns 0 pending rows, which
// currently happens for every route_type_id in the shared dev DB. Remove
// once real data reliably has pending orders.
export function getFallbackPedidos(routeTypeId: string): Pedido[] {
  return MOCK_STOPS.map((stop, i) => ({
    id: `mock-pedido-${routeTypeId}-${i}`,
    order_number: `ORD-MOCK-${String(i + 1).padStart(3, '0')}`,
    customer_id: `mock-customer-${i}`,
    store_id: 'mock-store-1',
    status: 'pending',
    order_date: new Date().toISOString(),
    route_type_id: routeTypeId,
    ...stop,
  }));
}
