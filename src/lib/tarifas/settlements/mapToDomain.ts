// Conversión de fila de BD a dominio SettlementRecord.

import type { Row } from '../data';
import type {
  Allocation, MarginStatus, Override, Rule, SettlementOrder, SettlementRecord, SettlementReturn,
  SettlementBaseChange, SettlementStatus, Stage, TraceLine, TripContext, TripEdits, TripRecord,
} from '../types';

/**
 * 'YYYY-MM-DD' de una fecha que puede venir como texto ('2026-08-28', el almacén en memoria y los datos
 * viejos) o como medianoche UTC ('2026-08-28T00:00:00.000Z', lo que devuelve la API para una columna
 * `date`). Se corta en vez de pasar por `Date` para no correrla un día según la zona horaria.
 */
export function dateOnly(value: unknown): string {
  return value == null ? '' : String(value).slice(0, 10);
}

export function mapToDomain(row: Row): SettlementRecord {
  const money = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: row.id,
    countryId: row.country_id,
    tripId: row.trip_id,
    partyId: row.party_id ?? null,
    number: row.number,
    tripNumber: row.trip_number ?? '',
    settlementDate: dateOnly(row.settlement_date),
    status: row.status as SettlementStatus,
    tripInfo: (row.trip_info ?? {}) as TripRecord,
    tripEdits: (row.trip_edits ?? { customVars: {} }) as TripEdits,
    supersededBy: row.superseded_by ?? null,
    currency: row.currency,
    totalAmount: String(row.total_amount),
    notes: row.notes ?? null,
    marginReason: row.margin_reason ?? null,
    marginStatus: (row.margin_status ?? null) as MarginStatus | null,
    marginAmount: money(row.margin_amount),
    marginPct: money(row.margin_pct),
    costTotal: money(row.cost_total),
    costModelId: row.cost_model_id ?? null,
    cargoValue: row.cargo_value === null || row.cargo_value === undefined ? null : String(row.cargo_value),
    allocation: (row.allocation ?? null) as Allocation | null,
    orders: (row.orders ?? null) as SettlementOrder[] | null,
    trip: (row.trip ?? {}) as TripContext,
    trace: (row.trace ?? []) as TraceLine[],
    discarded: row.discarded ?? [],
    stageSubtotals: (row.stage_subtotals ?? {}) as Record<Stage, string>,
    warnings: (row.warnings ?? []) as string[],
    overrides: (row.overrides ?? {}) as Record<string, Override>,
    adhocRules: (row.adhoc_rules ?? []) as Rule[],
    rulesUsed: (row.rules_used ?? []) as Rule[],
    excludedSeqs: (row.excluded_seqs ?? []) as number[],
    baseChange: (row.base_change ?? null) as SettlementBaseChange | null,
    returns: (row.returns ?? []) as SettlementReturn[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
