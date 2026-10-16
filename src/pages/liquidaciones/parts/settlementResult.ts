// De una liquidación emitida a un `CalcResult`: lo que el desglose necesita, leído de lo guardado
// (no se recalcula). Lo comparten el detalle en pantalla y la proforma imprimible.

import type { CalcResult, SettlementRecord } from '../../../lib/tarifas/types';

export function settlementToResult(settlement: SettlementRecord): CalcResult {
  return {
    trace: settlement.trace,
    discarded: settlement.discarded,
    stageSubtotals: settlement.stageSubtotals,
    totalLiquidado: settlement.totalAmount,
    currency: settlement.currency,
    cost: {
      total: settlement.costTotal ?? '0',
      // Las líneas de la estructura de costos viajan dentro de la traza, marcadas con su origen.
      breakdown: settlement.trace.filter((line) => line.source === 'COST_ROW'),
      modelId: settlement.costModelId ?? '—',
      currency: settlement.currency,
    },
    margin: {
      amount: settlement.marginAmount ?? '0',
      pct: settlement.marginPct ?? '0',
      status: settlement.marginStatus ?? 'OK',
      basis: settlement.cargoValue ? 'CARGO' : 'NONE',
      cargoValue: settlement.cargoValue ?? '0',
      expense: settlement.totalAmount,
      currency: settlement.currency,
    },
    allocation: settlement.allocation,
    warnings: settlement.warnings,
    blockingIssues: [],
  };
}
