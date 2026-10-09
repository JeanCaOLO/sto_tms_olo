// Pedidos en viajes.

import { db } from '../data';
import { toTripOrder } from '../tripOrders';
import type { TripOrder } from '../types';

/** Los pedidos de un viaje (uno por guía), con la marca que se les haya puesto. */
export async function listTripOrders(tripId: string): Promise<TripOrder[]> {
  // La marca se lee de su tabla (no solo de la vista) para que valga igual con cualquier driver.
  // Las dos lecturas son independientes: van juntas, una sola espera de red en vez de dos.
  const [rows, marks] = await Promise.all([
    db().find('tripOrder', {
      where: [{ column: 'route_id', op: 'eq', value: tripId }],
      orderBy: [{ column: 'sequence_number' }, { column: 'guide_number', locale: true }],
    }),
    db().find('tripOrderMark', {
      where: [{ column: 'trip_id', op: 'eq', value: tripId }],
    }),
  ]);
  const byOrder = new Map(marks.map((m) => [String(m.order_id), m]));
  return rows.map((row) => {
    const mark = row.order_id ? byOrder.get(String(row.order_id)) : undefined;
    return toTripOrder(mark ? { ...row, mark: mark.mark, mark_reason: mark.reason } : row);
  });
}
