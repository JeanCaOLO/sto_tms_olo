// Helper puro: construye el PlanEditPayload para el PUT cuando se mueve un
// pedido de un viaje a otro. Devuelve la nueva composición (order_ids por
// viaje); el server revalida capacidad y recalcula secuencia. Se saca del hook
// para poder testearlo sin React.

import type { PlanEditPayload, RoutePlan } from './planes-types';

// Mueve orderId de fromTripId a toTripId (al final de su secuencia). Los demás
// viajes quedan igual. Si el pedido no está en el viaje origen, no cambia nada.
export function moverPedido(
  plan: RoutePlan,
  orderId: string,
  fromTripId: string,
  toTripId: string,
): PlanEditPayload {
  const trips = plan.trips.map((trip) => {
    let orderIds = trip.stops.map((s) => s.order_id);
    if (trip.id === fromTripId) orderIds = orderIds.filter((id) => id !== orderId);
    if (trip.id === toTripId && !orderIds.includes(orderId)) orderIds = [...orderIds, orderId];
    return { id: trip.id, order_ids: orderIds };
  });
  return { trips };
}
