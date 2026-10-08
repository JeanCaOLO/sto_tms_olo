// Acceso a datos de la estructura de costos de una compañía.
//
// La importación de una planilla entera pasa por `replaceRows`, que corre dentro de una
// TRANSACCIÓN: importar 40 filas de mantenimiento y que fallen las últimas 3 dejaría una estructura
// a medias, con un costo que parece válido y está incompleto. O entran todas, o no entra ninguna.

import { db, type Row } from './data';
import type {
  CostDriver, CostFrequency, CostGroup, CostStructure, CostStructureParams, CostStructureRow, Pred,
} from './types';

export interface CostStructureInput {
  /** Compañía dueña. Null = estructura por defecto del país. */
  partyId: string | null;
  countryId: string;
  name: string;
  operatingDaysPerMonth: number;
  params?: CostStructureParams;
  effectiveFrom: string | null;
  active: boolean;
  notes: string | null;
}

export const EMPTY_PARAMS: CostStructureParams = { kmPerYear: null, fuelPrice: null, fuelEfficiency: {} };

export interface CostRowInput {
  code: string;
  label: string;
  driver: CostDriver;
  amount: string;
  sign: 'ADD' | 'SUBTRACT';
  appliesWhen: Pred | null;
  unit: string | null;
  active: boolean;
  group?: CostGroup | null;
  frequency?: CostFrequency | null;
  frequencyQty?: number | null;
  unitQty?: number | null;
  costPerKm?: string | null;
  truckType?: string | null;
}

export type StructureErrors = Partial<Record<keyof CostStructureInput, string>>;

export type SaveStructureResult =
  | { status: 'saved'; structure: CostStructure }
  | { status: 'invalid'; errors: StructureErrors }
  | { status: 'failed'; error: { message: string } };

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

// ── Estructuras ───────────────────────────────────────────────────────────────────────────────

/** Estructuras de una compañía o, con `partyId` nulo, las por defecto de un país. */
export async function listStructures(partyId: string | null, countryId?: string): Promise<CostStructure[]> {
  const rows = await db().find('costStructure', {
    where: [
      { column: 'party_id', op: 'eq', value: partyId },
      ...(partyId === null && countryId ? [{ column: 'country_id', op: 'eq' as const, value: countryId }] : []),
    ],
    orderBy: [{ column: 'name', locale: true }],
  });
  return rows.map(toCostStructure);
}

/** La estructura vigente de una compañía: la activa. Es la que usa el motor al liquidar. */
export async function activeStructure(partyId: string | null, countryId?: string): Promise<CostStructure | null> {
  const rows = await db().find('costStructure', {
    where: [
      { column: 'party_id', op: 'eq', value: partyId },
      ...(partyId === null && countryId ? [{ column: 'country_id', op: 'eq' as const, value: countryId }] : []),
      { column: 'active', op: 'eq', value: true },
    ],
    limit: 1,
  });
  return rows[0] ? toCostStructure(rows[0]) : null;
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
    params: input.params ?? EMPTY_PARAMS,
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

// ── Filas ─────────────────────────────────────────────────────────────────────────────────────

export async function listRows(structureId: string): Promise<CostStructureRow[]> {
  const rows = await db().find('costStructureRow', {
    where: [{ column: 'structure_id', op: 'eq', value: structureId }],
    orderBy: [{ column: 'row_order' }],
  });
  return rows.map(toCostStructureRow);
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

// ── Aplicar una plantilla ─────────────────────────────────────────────────────────────────────

export interface ApplyTemplateInput {
  /** Compañía dueña. Null = estructura por defecto del país. */
  partyId: string | null;
  countryId: string;
  name: string;
  operatingDaysPerMonth: number;
  params: CostStructureParams;
  rows: CostRowInput[];
}

export type ApplyTemplateResult =
  | { status: 'saved'; structureId: string; inserted: number }
  | { status: 'failed'; error: { message: string } };

/** Mismo formato que `genId` del driver JSON: `<prefijo>_<ms base36>_<6 hex>`. */
function newId(prefix: string): string {
  const random = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/**
 * Deja la estructura de ese ámbito (compañía o país) con EXACTAMENTE las filas de la plantilla:
 * reemplaza las que había. Todo en una transacción — una carga a medias dejaría un costo que parece
 * válido y está incompleto. El id de una estructura nueva se genera acá porque dentro de una
 * transacción por HTTP el servidor no devuelve la fila hasta confirmar.
 */
export async function applyCostTemplate(input: ApplyTemplateInput): Promise<ApplyTemplateResult> {
  const errors = validateStructure({
    partyId: input.partyId, countryId: input.countryId, name: input.name,
    operatingDaysPerMonth: input.operatingDaysPerMonth, effectiveFrom: null, active: true, notes: null,
  });
  if (Object.keys(errors).length > 0) {
    return { status: 'failed', error: { message: Object.values(errors).join(' ') } };
  }

  try {
    return await db().transaction(async (tx) => {
      const existing = await tx.find('costStructure', {
        where: [
          { column: 'party_id', op: 'eq', value: input.partyId },
          ...(input.partyId === null ? [{ column: 'country_id', op: 'eq' as const, value: input.countryId }] : []),
          { column: 'active', op: 'eq', value: true },
        ],
        limit: 1,
      });

      const values: Row = {
        party_id: input.partyId,
        country_id: input.countryId,
        name: input.name.trim(),
        operating_days_per_month: input.operatingDaysPerMonth,
        params: input.params,
        active: true,
      };

      let structureId: string;
      if (existing[0]) {
        structureId = existing[0].id;
        await tx.update('costStructure', structureId, values);
        const old = await tx.find('costStructureRow', {
          where: [{ column: 'structure_id', op: 'eq', value: structureId }],
        });
        for (const row of old) await tx.delete('costStructureRow', row.id);
      } else {
        structureId = newId('cstr');
        await tx.insert('costStructure', { id: structureId, effective_from: null, notes: null, ...values });
      }

      let order = 0;
      for (const row of input.rows) {
        await tx.insert('costStructureRow', rowValues(structureId, row, order));
        order += 1;
      }
      return { status: 'saved' as const, structureId, inserted: order };
    });
  } catch (error) {
    return { status: 'failed', error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
