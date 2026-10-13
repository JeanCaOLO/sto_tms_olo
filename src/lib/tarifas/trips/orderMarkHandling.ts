// Marcas en pedidos de viajes (anular, diferir, etc).

import { db } from '../data';
import { getActorRole } from '../actor';
import type { OrderMark, TripRecord } from '../types';

export interface OrderMarkInput {
  trip: Pick<TripRecord, 'id' | 'countryId'>;
  orderId: string;
  /** Null = quitar la marca: el pedido vuelve a entrar en la liquidación. */
  mark: OrderMark | null;
  reason?: string | null;
}

/**
 * Anula un pedido del viaje, lo deja para liquidar después, o le quita la marca. Una sola marca por
 * pedido y viaje. Anular exige un motivo: es lo que la auditoría va a querer saber.
 */
export async function setOrderMark(input: OrderMarkInput): Promise<{ error: string | null }> {
  const reason = input.reason?.trim() || null;
  if (input.mark === 'ANULADO' && !reason) return { error: 'Indicá por qué se anula el pedido.' };

  try {
    await db().transaction(async (tx) => {
      const existing = await tx.find('tripOrderMark', {
        where: [
          { column: 'trip_id', op: 'eq', value: input.trip.id },
          { column: 'order_id', op: 'eq', value: input.orderId },
        ],
      });
      if (!input.mark) {
        for (const row of existing) await tx.delete('tripOrderMark', row.id);
        return;
      }
      const values = {
        country_id: input.trip.countryId,
        trip_id: input.trip.id,
        order_id: input.orderId,
        mark: input.mark,
        reason,
        actor: getActorRole(),
      };
      if (existing[0]) await tx.update('tripOrderMark', existing[0].id, values);
      else await tx.insert('tripOrderMark', values);
    });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
