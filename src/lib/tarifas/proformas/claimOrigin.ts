// Marca "viene de un reclamo": la liquidación nueva de un viaje que se devolvió por reclamo guarda de cuál.

import { db } from '../data';

/**
 * Si el viaje tiene una liquidación anulada por reclamo, la nueva (`settlementId`) queda marcada con ese reclamo,
 * para avisar en la proforma que hay que verificar que se aplicó lo indicado. Un fallo aquí no tumba la emisión.
 */
export async function stampClaimOrigin(settlementId: string, tripId: string): Promise<void> {
  try {
    const voided = await db().find('settlement', {
      where: [
        { column: 'trip_id', op: 'eq', value: tripId },
        { column: 'status', op: 'eq', value: 'Anulado' },
        { column: 'void_kind', op: 'eq', value: 'reclamo' },
      ],
      columns: ['id', 'claim_id', 'updated_at'],
      orderBy: [{ column: 'updated_at', direction: 'desc' }],
      limit: 1,
    });
    const claimId = voided[0]?.claim_id;
    if (claimId) await db().update('settlement', settlementId, { from_claim_id: String(claimId) });
  } catch (error) {
    console.warn('No se pudo marcar el origen por reclamo de la liquidación', error);
  }
}
