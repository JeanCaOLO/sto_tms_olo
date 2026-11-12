// Cambiar estado de una liquidación.

import { auditRow } from './audit';
import { updateStatus } from './statusTransitions';
import type { SettlementStatus } from '../types';

/**
 * Cambia el estado de una liquidación ya emitida.
 *
 * No hay borrado: una liquidación se ANULA. Borrarla dejaría un hueco en la numeración y borraría
 * la prueba de lo que se pagó. Una anulada que ya fue reemplazada no se puede reactivar.
 *
 * El cambio y su bitácora se escriben en la misma transacción.
 */
export async function updateSettlementStatus(
  id: string,
  status: SettlementStatus,
  options?: { marginReason?: string },
): Promise<{ error: string | null }> {
  return updateStatus(id, status, {
    ...options,
    audit: (previous) => auditRow(
      status === 'Aprobado' || status === 'Pagado' ? 'AUTHORIZE' : 'UPDATE',
      id, { status: previous }, { status }, options?.marginReason,
    ),
  });
}
