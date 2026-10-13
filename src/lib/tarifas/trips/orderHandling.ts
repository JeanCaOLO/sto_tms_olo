// Pedidos en viajes.

import { db } from '../data';
import { toTripOrder } from '../tripOrders';
import type { TripOrder } from '../types';

/** Ids por consulta: `in` con muchos valores desborda la URL/el payload del backend. */
const IDS_PER_QUERY = 200;

/**
 * Los pedidos de VARIOS viajes agrupados por viaje, en pocas consultas (`in`, por lotes) en vez de una por
 * viaje. Mismo orden y misma lectura de marcas que `listTripOrders`. Todo viaje pedido queda en el mapa.
 */
export async function listOrdersForTrips(tripIds: string[]): Promise<Map<string, TripOrder[]>> {
  const ids = [...new Set(tripIds)];
  const result = new Map<string, TripOrder[]>(ids.map((id) => [id, []]));
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_QUERY) batches.push(ids.slice(i, i + IDS_PER_QUERY));

  await Promise.all(batches.map(async (batch) => {
    const [rows, marks] = await Promise.all([
      db().find('tripOrder', {
        where: [{ column: 'route_id', op: 'in', value: batch }],
        orderBy: [{ column: 'sequence_number' }, { column: 'guide_number', locale: true }],
      }),
      db().find('tripOrderMark', {
        where: [{ column: 'trip_id', op: 'in', value: batch }],
      }),
    ]);
    // Una marca es de un pedido DENTRO de un viaje: la clave lleva los dos.
    const byOrder = new Map(marks.map((m) => [`${String(m.trip_id)}|${String(m.order_id)}`, m]));
    for (const row of rows) {
      const mark = row.order_id ? byOrder.get(`${String(row.route_id)}|${String(row.order_id)}`) : undefined;
      result.get(String(row.route_id))?.push(
        toTripOrder(mark ? { ...row, mark: mark.mark, mark_reason: mark.reason } : row),
      );
    }
  }));
  return result;
}

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
