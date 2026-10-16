// Carga masiva de filas desde importación.

import { parseRange, rangesOverlap } from '../rateRange';
import { db } from '../data';
import { type PartyVariable, type RateTable, type RateTableRow } from '../types';
import { isRangeKeyVar, keyFingerprint } from './schema';
import { getRateTable } from './crud';
import { listRateTableRows } from './rows/crud';
import { cleanValues, normalizeKey } from './rows/schema';
import { listPartyVariables } from '../partyVariablesDataSource';

export interface BulkRow {
  key: string[];
  amount: string;
  values?: Record<string, string>;
}

export interface BulkResult {
  inserted: number;
  replaced: number;
  error: string | null;
}

export function validateImportedRanges(
  table: Pick<RateTable, 'keyColumns'>,
  rows: BulkRow[],
  kept: Pick<RateTableRow, 'key'>[] = [],
  partyVariables: PartyVariable[] = [],
): string | null {
  const count = table.keyColumns.length;
  const numeric = (column: string) =>
    isRangeKeyVar(column) || partyVariables.some((v) => v.key === column && v.kind === 'NUMBER');

  const keys = rows.map((r) => normalizeKey(r.key, count));
  for (const [n, key] of keys.entries()) {
    for (let i = 0; i < count; i += 1) {
      const cell = key[i]!;
      const range = parseRange(cell);
      if (!range) {
        if (/\.\./.test(cell)) return `Fila ${n + 1}: "${cell}" no es un rango válido. Use el formato 101..300, ..100 o 301..`;
        continue;
      }
      if (!numeric(table.keyColumns[i]!)) {
        return `Fila ${n + 1}: la columna "${table.keyColumns[i]}" no es numérica, no admite rangos ("${cell}").`;
      }
      if (range.from !== null && range.to !== null && range.from > range.to) {
        return `Fila ${n + 1}: el rango "${cell}" está al revés (el inicio es mayor que el final).`;
      }
    }
  }

  const pisa = (a: string[], b: string[]) => a.every((cell, i) => {
    const ra = parseRange(cell);
    const rb = parseRange(b[i]!);
    if (ra && rb) return rangesOverlap(ra, rb);
    return cell.toUpperCase() === b[i]!.toUpperCase();
  });
  const todas = [...kept.map((r) => normalizeKey(r.key, count)), ...keys];
  for (let a = 0; a < keys.length; a += 1) {
    const mia = keys[a]!;
    if (!mia.some((c) => parseRange(c))) continue;
    for (let b = 0; b < todas.length; b += 1) {
      if (b === kept.length + a) continue;
      const otra = todas[b]!;
      if (otra.every((c, i) => c.toUpperCase() === mia[i]!.toUpperCase())) continue;
      if (pisa(mia, otra)) return `Fila ${a + 1}: el rango se pisa con otra fila (${otra.join(' | ')}): un mismo valor tendría dos tarifas.`;
    }
  }
  return null;
}

export async function bulkUpsertRows(
  tableId: string,
  rows: BulkRow[],
  mode: 'replace' | 'merge',
): Promise<BulkResult> {
  const table = await getRateTable(tableId);
  if (!table) return { inserted: 0, replaced: 0, error: 'El tarifario ya no existe.' };

  try {
    const existing = await listRateTableRows(tableId);
    const partyVariables = table.partyId && table.keyColumns.some((k) => k.startsWith('custom:'))
      ? await listPartyVariables(table.partyId)
      : [];
    const problema = validateImportedRanges(table, rows, mode === 'replace' ? [] : existing, partyVariables);
    if (problema) return { inserted: 0, replaced: 0, error: problema };

    const vigentes = mode === 'replace' ? [] : existing;
    const porClave = new Map(
      vigentes.map((r) => [keyFingerprint(normalizeKey(r.key, table.keyColumns.length)), r]),
    );

    const unicas = new Map<string, BulkRow & { key: string[] }>();
    for (const row of rows) {
      const key = normalizeKey(row.key, table.keyColumns.length);
      unicas.set(keyFingerprint(key), { ...row, key });
    }

    return await db().transaction(async (tx) => {
      if (mode === 'replace') {
        for (const row of existing) await tx.delete('rateTableRow', row.id);
      }

      let order = vigentes.reduce((max, r) => Math.max(max, r.order), 0);
      let inserted = 0;
      let replaced = 0;

      for (const [fingerprint, row] of unicas) {
        const previa = porClave.get(fingerprint);
        if (previa) {
          await tx.update('rateTableRow', previa.id, {
            amount: row.amount, extra_values: cleanValues(row.values), active: true,
          });
          replaced += 1;
        } else {
          order += 1;
          await tx.insert('rateTableRow', {
            table_id: tableId, key: row.key, amount: row.amount, extra_values: cleanValues(row.values),
            row_order: order, active: true,
          });
          inserted += 1;
        }
      }

      return { inserted, replaced, error: null };
    });
  } catch (error) {
    return {
      inserted: 0,
      replaced: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
