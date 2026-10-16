// Esquema y mapeo de filas de tarifarios.

import { type Row } from '../../data';
import { type RateTableRow, RATE_TABLE_WILDCARD } from '../../types';

export interface RateTableRowInput {
  tableId: string;
  key: string[];
  amount: string;
  values?: Record<string, string>;
  active: boolean;
}

export type RateRowErrors = { key?: string; amount?: string; values?: string };

/** Solo los valores adicionales que traen algo, con el número ya recortado. */
export function cleanValues(values: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values ?? {})
      .map(([name, value]) => [name, String(value ?? '').trim()] as const)
      .filter(([, value]) => value !== ''),
  );
}

export function normalizeKey(key: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, i) => {
    const raw = (key[i] ?? '').trim();
    return raw === '' ? RATE_TABLE_WILDCARD : raw;
  });
}

export function toRow(row: Row): RateTableRow {
  return {
    id: row.id,
    tableId: row.table_id,
    key: (row.key ?? []) as string[],
    amount: String(row.amount),
    values: Object.fromEntries(
      Object.entries((row.extra_values ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    ),
    order: Number(row.row_order ?? 0),
    active: !!row.active,
  };
}
