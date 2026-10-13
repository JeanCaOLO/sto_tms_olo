// Mapeo de Row → dominio (CostStructure, CostStructureRow).

import type { Row } from '../data';
import type {
  CostDriver, CostFrequency, CostGroup, CostStructure, CostStructureParams, CostStructureRow, Pred,
} from '../types';

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

/** Parámetros guardados → forma completa (las estructuras viejas no los traen). */
function toParams(raw: unknown): CostStructureParams {
  const p = (raw ?? {}) as Partial<CostStructureParams>;
  return {
    kmPerYear: toNumberOrNull(p.kmPerYear),
    fuelPrice: p.fuelPrice === null || p.fuelPrice === undefined ? null : String(p.fuelPrice),
    fuelEfficiency: Object.fromEntries(
      Object.entries(p.fuelEfficiency ?? {}).map(([truck, km]) => [truck, String(km)]),
    ),
  };
}

export function toCostStructure(row: Row): CostStructure {
  return {
    id: row.id,
    partyId: row.party_id ?? null,
    countryId: row.country_id,
    name: row.name,
    operatingDaysPerMonth: Number(row.operating_days_per_month),
    params: toParams(row.params),
    effectiveFrom: row.effective_from ?? null,
    active: !!row.active,
    notes: row.notes ?? null,
  };
}

export function toCostStructureRow(row: Row): CostStructureRow {
  return {
    id: row.id,
    structureId: row.structure_id,
    code: row.code,
    label: row.label,
    driver: row.driver,
    amount: String(row.amount),
    sign: row.sign,
    appliesWhen: row.applies_when ?? null,
    unit: row.unit ?? null,
    order: Number(row.row_order ?? 0),
    active: !!row.active,
    group: row.cost_group ?? null,
    frequency: row.frequency ?? null,
    frequencyQty: toNumberOrNull(row.frequency_qty),
    unitQty: toNumberOrNull(row.unit_qty),
    costPerKm: row.cost_per_km === null || row.cost_per_km === undefined ? null : String(row.cost_per_km),
    truckType: row.truck_type ?? null,
  };
}
