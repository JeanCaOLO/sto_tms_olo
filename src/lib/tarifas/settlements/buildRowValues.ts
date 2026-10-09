// Construcción de valores para insertar/actualizar una liquidación en BD.

import type { Row } from '../data';
import type { SettlementInput, TripRecord } from '../types';
import { usuarioActual } from './audit';

export function buildRowValues(input: SettlementInput, trip: TripRecord, ahora: string): Row {
  return {
    country_id: trip.countryId,
    trip_id: trip.id,
    party_id: input.partyId,
    trip_number: trip.routeNumber,
    settlement_date: trip.routeDate,
    status: input.status,
    currency: input.calc.currency,
    total_amount: input.totalAmount,
    notes: input.notes?.trim() || null,
    margin_reason: input.marginReason?.trim() || null,
    margin_status: input.calc.margin.status,
    margin_amount: input.calc.margin.amount,
    margin_pct: input.calc.margin.pct,
    cost_total: input.calc.cost.total,
    cost_model_id: input.calc.cost.modelId,
    cargo_value: input.calc.margin.basis === 'CARGO' ? input.calc.margin.cargoValue : null,
    allocation: input.calc.allocation ?? null,
    orders: input.orders ?? null,
    // La foto es la del viaje RELEÍDO al emitir, no la que traía la pantalla.
    trip_info: { ...trip, settlementId: null },
    trip_edits: input.edits ?? { customVars: {} },
    trip: input.context,
    trace: input.calc.trace,
    discarded: input.calc.discarded,
    stage_subtotals: input.calc.stageSubtotals,
    warnings: input.calc.warnings,
    overrides: input.overrides ?? {},
    adhoc_rules: input.adhocRules ?? [],
    rules_used: input.rulesUsed ?? [],
    excluded_seqs: input.excludedSeqs ?? [],
    // Solo se escribe cuando hay cambio: así la base por defecto no exige la columna nueva en la base.
    ...(input.baseChange
      ? { base_change: { ...input.baseChange, changedBy: input.baseChange.changedBy ?? usuarioActual(), changedAt: ahora } }
      : {}),
    returns: input.returns ?? [],
    superseded_by: null,
    updated_at: ahora,
  };
}
