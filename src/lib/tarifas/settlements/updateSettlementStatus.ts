// Cambiar estado de una liquidación.

import { db } from '../data';
import { auditar } from './audit';
import { updateStatus } from './statusTransitions';
import type { SettlementStatus } from '../types';

/**
 * Cambia el estado de una liquidación ya emitida.
 *
 * No hay borrado: una liquidación se ANULA. Borrarla dejaría un hueco en la numeración y borraría
 * la prueba de lo que se pagó. Una anulada que ya fue reemplazada no se puede reactivar.
 */
export async function updateSettlementStatus(
  id: string,
  status: SettlementStatus,
  options?: { marginReason?: string },
): Promise<{ error: string | null }> {
  const result = await updateStatus(id, status, options);
  if (!result.error) {
    try {
      const actual = await db().findOne('settlement', id);
      await auditar(
        status === 'Aprobado' || status === 'Pagado' ? 'AUTHORIZE' : 'UPDATE',
        id, { status: actual?.status }, { status }, options?.marginReason,
      );
    } catch (error) {
      console.error('[tarifas] Error al auditar cambio de estado', error);
    }
  }
  return result;
}
