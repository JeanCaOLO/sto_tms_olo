// Helpers for settlement emission logic.

import { snapshotOrders } from '../../../lib/tarifas/tripOrders';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';
import type {
  CalcResult, SettlementInput, SettlementReturn, SettlementStatus, TripEdits,
} from '../../../lib/tarifas/types';

export const ESTADOS = ['Borrador', 'En Revisión', 'Aprobado', 'Pagado'] as const;

const isValidStatus = (s: string): s is SettlementStatus =>
  (ESTADOS as readonly string[]).includes(s);

export function buildEmissionInput(
  calculation: TripCalculation,
  editsUsed: TripEdits,
  status: string,
  notes: string,
  excludedSeqs: Set<number>,
  returns: SettlementReturn[],
  effectiveResult: CalcResult,
  totals: { total: string },
): SettlementInput {
  const validStatus = isValidStatus(status) ? status : 'Borrador';
  return {
    trip: calculation.trip,
    partyId: calculation.partyId,
    edits: editsUsed,
    status: validStatus,
    notes: notes.trim() || null,
    marginReason: null,
    context: calculation.context,
    calc: effectiveResult,
    rulesUsed: calculation.input.rules.filter((r) =>
      calculation.result.trace.some((l) => l.ruleId === r.id),
    ),
    excludedSeqs: [...excludedSeqs],
    // Quién y cuándo lo cambió lo completa la capa de datos al guardar.
    baseChange: calculation.result.base
      ? { ...calculation.result.base, changedBy: null, changedAt: '' }
      : null,
    returns,
    orders: calculation.orders.length > 0 ? snapshotOrders(calculation.orders) : null,
    totalAmount: totals.total,
  };
}

export const ruleHref = (origin: { source: string | null; ruleId: string | null }) =>
  origin.source === 'RULE' && origin.ruleId ? `/reglas-tarifa?regla=${encodeURIComponent(origin.ruleId)}` : null;
