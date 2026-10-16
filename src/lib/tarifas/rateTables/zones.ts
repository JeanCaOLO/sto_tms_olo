// Integridad de zonas: filas que usan cada zona.

import { db, type Row } from '../data';
import { type RateTable, type RateTableRow, type VarKey } from '../types';
import { ZONE_KEY_VARS, keyFingerprint } from './schema';

export interface RateTableZoneUse {
  tableCode: string;
  rowKey: string[];
}

/** Filas de tarifario que nombran esta zona. PURA, para poder probarla sin la capa de datos. */
export function rowsUsingZone(
  zoneCode: string,
  tables: Pick<RateTable, 'id' | 'code' | 'keyColumns'>[],
  rows: Pick<RateTableRow, 'tableId' | 'key'>[],
): RateTableZoneUse[] {
  const buscado = zoneCode.trim().toUpperCase();
  if (!buscado) return [];

  const usos: RateTableZoneUse[] = [];
  for (const table of tables) {
    const posiciones = table.keyColumns
      .map((column, i) => (ZONE_KEY_VARS.includes(column) ? i : -1))
      .filter((i) => i >= 0);
    if (posiciones.length === 0) continue;

    for (const row of rows.filter((r) => r.tableId === table.id)) {
      if (posiciones.some((i) => (row.key[i] ?? '').trim().toUpperCase() === buscado)) {
        usos.push({ tableCode: table.code, rowKey: row.key });
      }
    }
  }
  return usos;
}

/** Igual que `rowsUsingZone`, pero leyendo de la base. */
export async function zoneUsedByRateTables(zoneCode: string): Promise<RateTableZoneUse[]> {
  const [tables, rows] = await Promise.all([
    db().find('rateTable'),
    db().find('rateTableRow'),
  ]);

  const toTable = (row: Row) => ({
    id: row.id,
    code: row.code,
    keyColumns: (row.key_columns ?? []) as VarKey[],
  });

  const toRow = (row: Row) => ({
    tableId: row.table_id,
    key: (row.key ?? []) as string[],
  });

  return rowsUsingZone(
    zoneCode,
    tables.map(toTable),
    rows.map(toRow),
  );
}
