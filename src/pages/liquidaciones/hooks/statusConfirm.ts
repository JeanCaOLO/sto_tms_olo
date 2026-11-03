// Confirmación de los cambios de estado de una liquidación que no se pueden deshacer desde la pantalla.

import { confirmAction } from '../../../lib/confirm';
import type { SettlementRecord, SettlementStatus } from '../../../lib/tarifas/types';

/**
 * true = seguir con el cambio. Anular y marcar como Pagado piden confirmar: desde Pagado solo se puede anular, así que
 * un clic equivocado en el selector de estado no tenía vuelta atrás. Los demás cambios no preguntan.
 */
export async function confirmStatusChange(settlement: Pick<SettlementRecord, 'number'>, status: SettlementStatus): Promise<boolean> {
  if (status === 'Anulado') {
    return confirmAction({
      title: 'Anular liquidación',
      message: `¿Anular ${settlement.number}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Anular',
      variant: 'danger',
    });
  }
  if (status === 'Pagado') {
    return confirmAction({
      title: 'Marcar como pagada',
      message: `¿Marcar ${settlement.number} como Pagada? Después solo se puede anular.`,
      confirmLabel: 'Marcar como pagada',
    });
  }
  return true;
}
