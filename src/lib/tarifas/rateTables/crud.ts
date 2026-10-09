// CRUD de tarifarios: crear, leer, actualizar, eliminar.

import { db, type DataSource, type Row } from '../data';
import { listPartyVariables } from '../partyVariablesDataSource';
import { type RateTable, type VarKey, RATE_TABLE_WILDCARD } from '../types';
import { mismaClave } from './schema';
import { normalizeKey } from './rows/schema';
import { type RateTableInput, validateRateTable } from './validation';

export type SaveRateTableResult =
  | { status: 'saved'; table: RateTable }
  | { status: 'invalid'; errors: Partial<Record<keyof RateTableInput, string>> }
  | { status: 'failed'; error: { message: string } };

function toTable(row: Row): RateTable {
  return {
    id: row.id,
    countryId: row.country_id,
    partyId: row.party_id ?? null,
    code: row.code,
    name: row.name,
    keyColumns: (row.key_columns ?? []) as VarKey[],
    valueColumns: ((row.value_columns ?? []) as unknown[]).map(String),
    active: !!row.active,
  };
}

export async function listRateTables(
  countryId: string,
  options?: { includeInactive?: boolean },
): Promise<RateTable[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [
    { column: 'country_id', op: 'eq', value: countryId },
  ];
  if (!options?.includeInactive) where.push({ column: 'active', op: 'eq', value: true });

  const rows = await db().find('rateTable', {
    where,
    orderBy: [{ column: 'code', locale: true }],
  });
  return rows.map(toTable);
}

export async function getRateTable(id: string): Promise<RateTable | null> {
  const row = await db().findOne('rateTable', id);
  return row ? toTable(row) : null;
}

async function remapRows(source: DataSource, anterior: RateTable, nuevaClave: VarKey[]): Promise<void> {
  const rows = await source.find('rateTableRow', {
    where: [{ column: 'table_id', op: 'eq', value: anterior.id }],
  });

  for (const row of rows) {
    const previo = (row.key ?? []) as string[];
    const nueva = nuevaClave.map((columna) => {
      const i = anterior.keyColumns.indexOf(columna);
      return i >= 0 ? (previo[i] ?? RATE_TABLE_WILDCARD) : RATE_TABLE_WILDCARD;
    });
    await source.update('rateTableRow', row.id, { key: nueva });
  }
}

async function dropRowValues(source: DataSource, tableId: string, removed: string[]): Promise<void> {
  const rows = await source.find('rateTableRow', { where: [{ column: 'table_id', op: 'eq', value: tableId }] });
  for (const row of rows) {
    const extra = (row.extra_values ?? {}) as Record<string, string>;
    if (!removed.some((c) => c in extra)) continue;
    const kept = Object.fromEntries(Object.entries(extra).filter(([c]) => !removed.includes(c)));
    await source.update('rateTableRow', row.id, { extra_values: kept });
  }
}

export async function saveRateTable(
  input: RateTableInput,
  id?: string,
): Promise<SaveRateTableResult> {
  const existing = (await db().find('rateTable')).map(toTable);
  const partyVariables = input.partyId && input.keyColumns.some((k) => k.startsWith('custom:'))
    ? await listPartyVariables(input.partyId)
    : [];
  const errors = validateRateTable(input, existing, id, partyVariables);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const anterior = id ? existing.find((t) => t.id === id) : undefined;
  const keyColumnsAsVarKey = input.keyColumns as VarKey[];
  const reacomodar = anterior && !mismaClave(anterior.keyColumns, keyColumnsAsVarKey);

  const values: Row = {
    country_id: input.countryId,
    party_id: input.partyId,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    key_columns: keyColumnsAsVarKey,
    value_columns: (input.valueColumns ?? []).map((c) => c.trim()),
    active: input.active,
  };

  try {
    if (!id) return { status: 'saved', table: toTable(await db().insert('rateTable', values)) };

    const saved = await db().transaction(async (tx) => {
      const updated = await tx.update('rateTable', id, values);
      if (reacomodar && anterior) await remapRows(tx, anterior, keyColumnsAsVarKey);
      const quitadas = (anterior?.valueColumns ?? []).filter((c) => !(input.valueColumns ?? []).includes(c));
      if (quitadas.length > 0) await dropRowValues(tx, id, quitadas);
      return updated;
    });

    return { status: 'saved', table: toTable(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export async function setRateTableActive(id: string, active: boolean): Promise<{ error: string | null }> {
  try {
    await db().update('rateTable', id, { active });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteRateTable(id: string): Promise<{ error: string | null }> {
  try {
    await db().delete('rateTable', id);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
