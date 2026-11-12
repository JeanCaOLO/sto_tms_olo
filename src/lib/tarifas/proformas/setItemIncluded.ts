// Incluir o excluir una liquidación de una proforma. Solo mientras ninguna fase se haya decidido:
// aprobar algo y cambiarlo después dejaría aprobaciones sobre un contenido distinto.

import { db } from '../data';
import { proformaAuditRow } from './proformaAudit';
import { proformaTotal, toggleItem } from './proformaTotals';
import type { ProformaItem, ProformaPhase, ProformaRecord } from './types';

export function canEditItems(proforma: ProformaRecord, phases: ProformaPhase[]): boolean {
  const open = proforma.status === 'Borrador' || proforma.status === 'En Revisión';
  return open && phases.every((p) => p.state === 'pendiente' || p.state === 'omitida');
}

export async function setItemIncluded(
  proforma: ProformaRecord, phases: ProformaPhase[], items: ProformaItem[],
  settlementId: string, included: boolean, reason: string | null,
): Promise<{ error: string | null; items?: ProformaItem[] }> {
  if (!canEditItems(proforma, phases)) return { error: 'La proforma ya tiene fases decididas: no se pueden cambiar sus liquidaciones.' };
  try {
    const next = toggleItem(items, settlementId, included, reason);
    if (!next.some((i) => i.included)) return { error: 'La proforma debe conservar al menos una liquidación. Para descartarla, anúlala.' };
    const changed = next.find((i) => i.settlementId === settlementId)!;
    await db().transaction(async (tx) => {
      await tx.update('proformaItem', changed.id, {
        state: changed.included ? 'included' : 'excluded', exclusion_reason: changed.exclusionReason,
      });
      const now = new Date().toISOString();
      // Excluida = vuelve a Borrador y queda libre para otra proforma; incluida de nuevo = otra vez En Revisión.
      await tx.update('settlement', settlementId, { status: included ? 'En Revisión' : 'Borrador', updated_at: now });
      await tx.update('proforma', proforma.id, { total_amount: proformaTotal(next).toFixed(2), updated_at: now });
      await tx.insert('auditLog', proformaAuditRow('UPDATE', proforma.id, { settlementId, included: !included }, { settlementId, included }, reason ?? undefined));
    });
    return { error: null, items: next };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
