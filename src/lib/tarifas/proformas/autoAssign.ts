// Generación AUTOMÁTICA de proformas. Cada liquidación emitida entra sola a la proforma abierta de su
// transportista; si no hay una abierta, se crea. "Abierta" = en revisión y sin ninguna fase decidida
// todavía (después de la primera decisión el contenido ya no cambia: la siguiente liquidación abre otra).
// Sin fases configuradas en el país no se crea nada y la liquidación queda en Borrador: el barrido
// (`assignPendingSettlements`) la agrupa en cuanto se configuren.

import { db } from '../data';
import { listSettlementSummaries } from '../settlements/queryHelpers';
import type { SettlementRecord } from '../types';
import { createProforma } from './createProforma';
import { groupByCarrier, type CarrierGroup, type GroupableSettlement } from './groupByCarrier';
import { itemToRow, rowToItem, rowToPhase, rowToProforma } from './mapRows';
import { proformaAuditRow } from './proformaAudit';
import { proformaTotal } from './proformaTotals';
import { everGroupedSettlementIds, groupedSettlementIds, type ProformaWithPhases } from './proformaQueries';
import { canEditItems } from './setItemIncluded';

export interface AssignResult {
  created: number;
  added: number;
  /** 'no-phases' = el país no tiene fases; nada que hacer hasta que se configuren. */
  skipped: 'no-phases' | null;
  error: string | null;
}

const EMPTY: AssignResult = { created: 0, added: 0, skipped: null, error: null };

/** La primera proforma que todavía admite más liquidaciones (ver `canEditItems`). Pura. */
export function pickOpenProforma(candidates: ProformaWithPhases[]): ProformaWithPhases | null {
  return candidates.find((c) => canEditItems(c.proforma, c.phases)) ?? null;
}

async function listOpenCandidates(countryId: string, carrierId: string): Promise<ProformaWithPhases[]> {
  const rows = await db().find('proforma', {
    where: [
      { column: 'country_id', op: 'eq', value: countryId },
      { column: 'carrier_id', op: 'eq', value: carrierId },
      { column: 'status', op: 'eq', value: 'En Revisión' },
    ],
    orderBy: [{ column: 'created_at', direction: 'asc' }],
  });
  if (rows.length === 0) return [];
  const phases = (await db().find('proformaPhase', {
    where: [{ column: 'proforma_id', op: 'in', value: rows.map((r) => String(r.id)) }],
    orderBy: [{ column: 'position', direction: 'asc' }],
  })).map(rowToPhase);
  return rows.map(rowToProforma).map((proforma) => ({ proforma, phases: phases.filter((p) => p.proformaId === proforma.id) }));
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function addToProforma(target: ProformaWithPhases, settlements: GroupableSettlement[]): Promise<void> {
  const { proforma } = target;
  const current = (await db().find('proformaItem', { where: [{ column: 'proforma_id', op: 'eq', value: proforma.id }] })).map(rowToItem);
  const added = settlements.map((s) => ({
    id: newId('pri'), proformaId: proforma.id, settlementId: s.id, included: true, exclusionReason: null, amount: s.totalAmount,
  }));
  const now = new Date().toISOString();
  await db().transaction(async (tx) => {
    for (const item of added) await tx.insert('proformaItem', itemToRow(item));
    for (const s of settlements) await tx.update('settlement', s.id, { status: 'En Revisión', updated_at: now });
    await tx.update('proforma', proforma.id, { total_amount: proformaTotal([...current, ...added]).toFixed(2), updated_at: now });
    await tx.insert('auditLog', proformaAuditRow(
      'UPDATE', proforma.id, null, { added: settlements.map((s) => s.number) }, 'Liquidación agregada automáticamente',
    ));
  });
}

async function assignGroup(countryId: string, group: CarrierGroup): Promise<AssignResult> {
  const open = pickOpenProforma(await listOpenCandidates(countryId, group.carrierId));
  if (open) {
    await addToProforma(open, group.settlements);
    return { ...EMPTY, added: group.settlements.length };
  }
  const created = await createProforma({
    countryId, carrierId: group.carrierId, carrierName: group.carrierName, currency: group.currency, settlements: group.settlements,
  });
  const message = created.error;
  if (message !== null) {
    return created.reason === 'no-phases' ? { ...EMPTY, skipped: 'no-phases' } : { ...EMPTY, error: message };
  }
  return { ...EMPTY, created: 1 };
}

/** Agrupa las liquidaciones (solo las en Borrador sin proforma) por transportista y las asigna. Nunca lanza. */
export async function assignSettlements(
  countryId: string, settlements: GroupableSettlement[], skip?: Set<string>,
): Promise<AssignResult> {
  const total = { ...EMPTY };
  try {
    for (const group of groupByCarrier(settlements, skip ?? await groupedSettlementIds())) {
      const result = await assignGroup(countryId, group);
      total.created += result.created;
      total.added += result.added;
      total.skipped = total.skipped ?? result.skipped;
      total.error = total.error ?? result.error;
    }
  } catch (error) {
    total.error = error instanceof Error ? error.message : String(error);
  }
  return total;
}

export function toGroupable(s: SettlementRecord): GroupableSettlement {
  return {
    id: s.id, number: s.number, carrierId: s.tripInfo.carrierId ?? null, carrierName: s.tripInfo.carrierName ?? null,
    totalAmount: Number(s.totalAmount), currency: s.currency, status: s.status,
  };
}

/** Al emitir o re-liquidar: la liquidación entra sola a una proforma. Un fallo aquí NUNCA tumba la emisión. */
export async function autoAssignSettlement(settlement: SettlementRecord): Promise<AssignResult> {
  const result = await assignSettlements(settlement.countryId, [toGroupable(settlement)]);
  if (result.error) console.warn('[proformas] no se pudo asignar la liquidación', settlement.number, result.error);
  return result;
}

/** Barrido: agrupa las liquidaciones en Borrador que quedaron sin proforma (sin fases al liquidar, o anteriores a la función). */
export async function assignPendingSettlements(countryId: string): Promise<AssignResult> {
  try {
    const [settlements, released] = await Promise.all([
      listSettlementSummaries({ countryId, includeVoided: false }),
      everGroupedSettlementIds(),
    ]);
    // Las que ya pasaron por una proforma (liberadas al excluir o anular) no se agrupan solas otra vez.
    return await assignSettlements(countryId, settlements.map(toGroupable), released);
  } catch (error) {
    return { ...EMPTY, error: error instanceof Error ? error.message : String(error) };
  }
}
