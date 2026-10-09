// Mutaciones (insert, update, delete) para estructuras y filas de costos.

import { db, type Row } from '../data';
import type { CostStructure } from '../types';
import { toCostStructure, toCostStructureRow } from './schema';
import { validateStructure } from './validation';
import type {
  CostRowInput, CostStructureInput, SaveStructureResult, ApplyTemplateInput, ApplyTemplateResult,
  ImportOutcome, EMPTY_PARAMS,
} from './types';
import { listRows } from './queries';

export async function saveStructure(
  input: CostStructureInput,
  id?: string,
): Promise<SaveStructureResult> {
  const errors = validateStructure(input);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const values: Row = {
    party_id: input.partyId,
    country_id: input.countryId,
    name: input.name.trim(),
    operating_days_per_month: input.operatingDaysPerMonth,
    params: input.params ?? { kmPerYear: null, fuelPrice: null, fuelEfficiency: {} },
    effective_from: input.effectiveFrom,
    active: input.active,
    notes: input.notes?.trim() || null,
  };

  try {
    // Una sola estructura activa por compañía: dos activas harían que el costo dependiera de cuál
    // devolvió primero la base.
    return await db().transaction(async (tx) => {
      if (input.active) {
        const otras = await tx.find('costStructure', {
          where: [
            { column: 'party_id', op: 'eq', value: input.partyId },
            ...(input.partyId === null ? [{ column: 'country_id', op: 'eq' as const, value: input.countryId }] : []),
            { column: 'active', op: 'eq', value: true },
          ],
        });
        for (const otra of otras) {
          if (otra.id !== id) await tx.update('costStructure', otra.id, { active: false });
        }
      }

      const saved = id
        ? await tx.update('costStructure', id, values)
        : await tx.insert('costStructure', values);
      return { status: 'saved' as const, structure: toCostStructure(saved) };
    });
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function rowValues(structureId: string, input: CostRowInput, order: number): Row {
  return {
    structure_id: structureId,
    code: input.code,
    label: input.label,
    driver: input.driver,
    amount: input.amount,
    sign: input.sign,
    applies_when: input.appliesWhen,
    unit: input.unit,
    row_order: order,
    active: input.active,
    cost_group: input.group ?? null,
    frequency: input.frequency ?? null,
    frequency_qty: input.frequencyQty ?? null,
    unit_qty: input.unitQty ?? null,
    cost_per_km: input.costPerKm ?? null,
    truck_type: input.truckType ?? null,
  };
}

export async function addRow(structureId: string, input: CostRowInput): Promise<{ error: string | null }> {
  try {
    const existing = await listRows(structureId);
    const order = existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.order)) + 1;
    await db().insert('costStructureRow', rowValues(structureId, input, order));
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateRow(
  rowId: string,
  input: Partial<CostRowInput>,
): Promise<{ error: string | null }> {
  const values: Row = {};
  if (input.code !== undefined) values.code = input.code;
  if (input.label !== undefined) values.label = input.label;
  if (input.driver !== undefined) values.driver = input.driver;
  if (input.amount !== undefined) values.amount = input.amount;
  if (input.sign !== undefined) values.sign = input.sign;
  if (input.appliesWhen !== undefined) values.applies_when = input.appliesWhen;
  if (input.unit !== undefined) values.unit = input.unit;
  if (input.active !== undefined) values.active = input.active;
  if (input.truckType !== undefined) values.truck_type = input.truckType;
  if (input.group !== undefined) values.cost_group = input.group;

  try {
    await db().update('costStructureRow', rowId, values);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteRow(rowId: string): Promise<{ error: string | null }> {
  try {
    await db().delete('costStructureRow', rowId);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
