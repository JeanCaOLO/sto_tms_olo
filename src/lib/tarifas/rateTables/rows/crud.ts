// CRUD de filas: crear, leer, actualizar, eliminar.

import { db, type Row } from '../../data';
import { type RateTableRow } from '../../types';
import { getRateTable } from '../crud';
import { listPartyVariables } from '../../partyVariablesDataSource';
import { cleanValues, normalizeKey, toRow, type RateTableRowInput } from './schema';
import { validateRateRow } from './validation';

export type SaveRateRowResult =
  | { status: 'saved'; row: RateTableRow }
  | { status: 'invalid'; errors: { key?: string; amount?: string; values?: string } }
  | { status: 'failed'; error: { message: string } };

export async function listRateTableRows(tableId: string): Promise<RateTableRow[]> {
  const rows = await db().find('rateTableRow', {
    where: [{ column: 'table_id', op: 'eq', value: tableId }],
    orderBy: [{ column: 'row_order' }],
  });
  return rows.map(toRow);
}

export async function saveRateRow(
  input: RateTableRowInput,
  id?: string,
): Promise<SaveRateRowResult> {
  const table = await getRateTable(input.tableId);
  if (!table) {
    return { status: 'failed', error: { message: 'El tarifario ya no existe.' } };
  }

  const existing = await listRateTableRows(input.tableId);
  const partyVariables = table.partyId && table.keyColumns.some((k) => k.startsWith('custom:'))
    ? await listPartyVariables(table.partyId)
    : [];
  const errors = validateRateRow(input, table, existing, id, partyVariables);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const values: Row = {
    table_id: input.tableId,
    key: normalizeKey(input.key, table.keyColumns.length),
    amount: input.amount.trim(),
    extra_values: cleanValues(input.values),
    row_order: id
      ? (existing.find((r) => r.id === id)?.order ?? 0)
      : existing.reduce((max, r) => Math.max(max, r.order), 0) + 1,
    active: input.active,
  };

  try {
    const saved = id
      ? await db().update('rateTableRow', id, values)
      : await db().insert('rateTableRow', values);
    return { status: 'saved', row: toRow(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export async function deleteRateRow(id: string): Promise<{ error: string | null }> {
  try {
    await db().delete('rateTableRow', id);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
