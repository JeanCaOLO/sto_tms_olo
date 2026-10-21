// Escrituras de tarifarios y filas con su evento de bitácora: nada se guarda sin dejar rastro (A7).

import {
  deleteRateRow, deleteRateTable, saveRateRow, saveRateTable, setRateTableActive, type RateTableInput,
} from '../../../lib/tarifas/rateTablesDataSource';
import type { RateTable } from '../../../lib/tarifas/types';
import { registrarEventoSeguro } from '../../../lib/liquidador/auditLog';
import { getActorName, getActorRole } from '../../../lib/tarifas/actor';

export interface RateRowFormInput {
  tableId: string;
  key: string[];
  amount: string;
  values: Record<string, string>;
  active: boolean;
}

/** Deja el cambio en la bitácora sin tumbar la operación ya guardada (ver `registrarEventoSeguro`). */
async function audit(
  entidad: string,
  entidadId: string,
  accion: 'CREATE' | 'UPDATE' | 'DELETE',
  detalle: { antes?: unknown; despues?: unknown },
): Promise<void> {
  await registrarEventoSeguro({
    entidad, entidadId, accion,
    usuario: getActorName(),
    rol: getActorRole(),
    antes: detalle.antes ?? null,
    despues: detalle.despues ?? null,
  });
}

/** Crea o edita un tarifario y lo deja en la bitácora. */
export async function saveRateTableWithAudit(
  input: RateTableInput,
  id?: string,
  previous?: RateTable | null,
): ReturnType<typeof saveRateTable> {
  const result = await saveRateTable(input, id);
  if (result.status === 'saved') {
    const { table } = result;
    await audit('tarifas_rate_tables', table.id, id ? 'UPDATE' : 'CREATE', {
      antes: previous ?? null,
      despues: { code: table.code, name: table.name, partyId: table.partyId, keyColumns: table.keyColumns, valueColumns: table.valueColumns, active: table.active },
    });
  }
  return result;
}

export async function createOrUpdateRateRow(
  input: RateRowFormInput,
  editingRowId?: string,
): ReturnType<typeof saveRateRow> {
  const result = await saveRateRow({ ...input }, editingRowId);
  if (result.status === 'saved') {
    await audit('tarifas_rate_table_rows', result.row.id, editingRowId ? 'UPDATE' : 'CREATE', {
      despues: { tableId: input.tableId, key: input.key, amount: input.amount, values: input.values, active: input.active },
    });
  }
  return result;
}

export async function removeRateRow(rowId: string, tableId?: string): Promise<{ error: string | null }> {
  const result = await deleteRateRow(rowId);
  if (!result.error) await audit('tarifas_rate_table_rows', rowId, 'DELETE', { antes: { tableId: tableId ?? null } });
  return result;
}

export async function toggleRateTable(
  id: string,
  active: boolean,
  code?: string,
): Promise<{ error: string | null }> {
  const result = await setRateTableActive(id, !active);
  if (!result.error) {
    await audit('tarifas_rate_tables', id, 'UPDATE', { antes: { code: code ?? null, active }, despues: { code: code ?? null, active: !active } });
  }
  return result;
}

export async function removeRateTable(id: string, code?: string): Promise<{ error: string | null }> {
  const result = await deleteRateTable(id);
  if (!result.error) await audit('tarifas_rate_tables', id, 'DELETE', { antes: { code: code ?? null } });
  return result;
}

