// Acceso a datos de la estructura de costos de una compañía.
//
// La importación de una planilla entera pasa por `replaceRows`, que corre dentro de una
// TRANSACCIÓN: importar 40 filas de mantenimiento y que fallen las últimas 3 dejaría una estructura
// a medias, con un costo que parece válido y está incompleto. O entran todas, o no entra ninguna.

import { db, type Row } from './data';
import type { CostDriver, CostStructure, CostStructureRow, Pred } from './types';

export interface CostStructureInput {
  partyId: string;
  countryId: string;
  name: string;
  operatingDaysPerMonth: number;
  effectiveFrom: string | null;
  active: boolean;
  notes: string | null;
}

export interface CostRowInput {
  code: string;
  label: string;
  driver: CostDriver;
  amount: string;
  sign: 'ADD' | 'SUBTRACT';
  appliesWhen: Pred | null;
  unit: string | null;
  active: boolean;
}

export type StructureErrors = Partial<Record<keyof CostStructureInput, string>>;

export type SaveStructureResult =
  | { status: 'saved'; structure: CostStructure }
  | { status: 'invalid'; errors: StructureErrors }
  | { status: 'failed'; error: { message: string } };

function toStructure(row: Row): CostStructure {
  return {
    id: row.id,
    partyId: row.party_id,
    countryId: row.country_id,
    name: row.name,
    operatingDaysPerMonth: Number(row.operating_days_per_month),
    effectiveFrom: row.effective_from ?? null,
    active: !!row.active,
    notes: row.notes ?? null,
  };
}

function toRow(row: Row): CostStructureRow {
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
  };
}

// ── Estructuras ───────────────────────────────────────────────────────────────────────────────

export async function listStructures(partyId: string): Promise<CostStructure[]> {
  const rows = await db().find('costStructure', {
    where: [{ column: 'party_id', op: 'eq', value: partyId }],
    orderBy: [{ column: 'name', locale: true }],
  });
  return rows.map(toStructure);
}

/** La estructura vigente de una compañía: la activa. Es la que usa el motor al liquidar. */
export async function activeStructure(partyId: string): Promise<CostStructure | null> {
  const rows = await db().find('costStructure', {
    where: [
      { column: 'party_id', op: 'eq', value: partyId },
      { column: 'active', op: 'eq', value: true },
    ],
    limit: 1,
  });
  return rows[0] ? toStructure(rows[0]) : null;
}

export function validateStructure(input: CostStructureInput): StructureErrors {
  const errors: StructureErrors = {};
  if (!input.name.trim()) errors.name = 'Poné un nombre que la identifique.';
  if (!input.countryId) errors.countryId = 'Elegí el país: define la moneda.';
  if (!Number.isFinite(input.operatingDaysPerMonth) || input.operatingDaysPerMonth <= 0) {
    // Es el divisor del prorrateo mensual: en cero, todos esos costos darían cero sin avisar.
    errors.operatingDaysPerMonth = 'Los días operativos por mes deben ser mayores que cero.';
  }
  return errors;
}

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
      return { status: 'saved' as const, structure: toStructure(saved) };
    });
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

// ── Filas ─────────────────────────────────────────────────────────────────────────────────────

export async function listRows(structureId: string): Promise<CostStructureRow[]> {
  const rows = await db().find('costStructureRow', {
    where: [{ column: 'structure_id', op: 'eq', value: structureId }],
    orderBy: [{ column: 'row_order' }],
  });
  return rows.map(toRow);
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

export interface ImportOutcome {
  error: string | null;
  inserted: number;
}

/**
 * Importa un lote de filas. `mode`:
 *   - 'replace': borra las existentes y deja solo las nuevas
 *   - 'append' : las agrega al final, conservando las que había
 *
 * Todo dentro de una transacción: una importación a medias deja un costo que parece correcto y
 * está incompleto, que es peor que no importar nada.
 */
export async function importRows(
  structureId: string,
  inputs: CostRowInput[],
  mode: 'replace' | 'append',
): Promise<ImportOutcome> {
  try {
    return await db().transaction(async (tx) => {
      const existing = await tx.find('costStructureRow', {
        where: [{ column: 'structure_id', op: 'eq', value: structureId }],
      });

      if (mode === 'replace') {
        for (const row of existing) await tx.delete('costStructureRow', row.id);
      }

      const base = mode === 'append' && existing.length > 0
        ? Math.max(...existing.map((r) => Number(r.row_order ?? 0))) + 1
        : 0;

      // Los códigos tienen que ser únicos dentro de la estructura: dos filas con el mismo código
      // harían ambiguo el desglose.
      const used = new Set(
        mode === 'append' ? existing.map((r) => String(r.code)) : [],
      );

      let inserted = 0;
      for (const input of inputs) {
        let code = input.code;
        if (used.has(code)) {
          let n = 2;
          while (used.has(`${code}_${n}`)) n += 1;
          code = `${code}_${n}`;
        }
        used.add(code);
        await tx.insert('costStructureRow', rowValues(structureId, { ...input, code }, base + inserted));
        inserted += 1;
      }

      return { error: null, inserted };
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      inserted: 0,
    };
  }
}
