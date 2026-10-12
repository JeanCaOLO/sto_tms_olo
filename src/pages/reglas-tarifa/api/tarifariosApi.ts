// API para la gestión de tarifarios: orquesta rateTablesDataSource, partiesDataSource,
// localRulesDataSource y auditLog.

import {
  deleteRateRow,
  deleteRateTable,
  listRateTableRows,
  listRateTables,
  saveRateRow,
  saveRateTable,
  setRateTableActive,
  type RateRowErrors,
  type RateTableInput,
  bulkUpsertRows,
} from '../../../lib/tarifas/rateTablesDataSource';
import type { RateTable, RateTableRow } from '../../../lib/tarifas/types';
import {
  listCarrierProfiles,
  ensurePartyProfile,
} from '../../../lib/tarifas/partiesDataSource';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import { listTruckTypes } from '../../../lib/tarifas/vehiclesDataSource';
import { listPartyVariables } from '../../../lib/tarifas/partyVariablesDataSource';
import { registrarEventoSeguro } from '../../../lib/liquidador/auditLog';
import { getActorName, getActorRole } from '../../../lib/tarifas/actor';

// ── Tarifarios ─────────────────────────────────────────────────────────────

export interface TarifariosData {
  tables: RateTable[];
  parties: CarrierProfile[];
  truckCodes: string[];
}

export async function loadTarifariosData(
  countryId: string,
  partyId?: string,
): Promise<TarifariosData> {
  const tables = await listRateTables(countryId, { includeInactive: true });
  const filtered = partyId
    ? tables.filter((t) => t.partyId === partyId || !t.partyId)
    : tables;
  const parties = await listCarrierProfiles({ countryId, includeInactive: true });

  return { tables: filtered, parties, truckCodes: [] };
}

export async function loadTruckTypes(
  carrierId?: string,
): Promise<string[]> {
  const trucks = await listTruckTypes(carrierId ? { carrierId } : undefined);
  return trucks.map((t) => t.code);
}

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

export async function getRateTableRows(tableId: string): Promise<RateTableRow[]> {
  return listRateTableRows(tableId);
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

// ── Importación de filas ───────────────────────────────────────────────────

export async function bulkImportRows(
  tableId: string,
  rows: Array<{ key: string[]; amount: string; values?: Record<string, string> }>,
  mode: 'replace' | 'merge',
  fileName: string,
  usuarioActivo: string,
): Promise<{ error: string | null; inserted: number; replaced: number }> {
  try {
    const result = await bulkUpsertRows(tableId, rows, mode);
    if (result.error) return { error: result.error, inserted: 0, replaced: 0 };

    // Las filas ya se importaron: que falle leer el tarifario o la bitácora no debe hacer parecer que no.
    const table = await listRateTables('', { includeInactive: true })
      .then((t) => t.find((x) => x.id === tableId))
      .catch(() => undefined);
    await registrarEventoSeguro({
      entidad: 'tarifas_rate_table_rows',
      entidadId: tableId,
      accion: 'UPDATE',
      usuario: usuarioActivo,
      rol: getActorRole(),
      despues: {
        archivo: fileName,
        tarifario: table?.code || 'unknown',
        modo: mode,
        agregadas: result.inserted,
        reemplazadas: result.replaced,
      },
      motivo: `Importación de filas desde ${fileName}`,
    });

    return { error: null, inserted: result.inserted, replaced: result.replaced };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error desconocido',
      inserted: 0,
      replaced: 0,
    };
  }
}

// ── Utilidades ──────────────────────────────────────────────────────────────

export async function loadPartyVariables(partyId: string) {
  return listPartyVariables(partyId, { includeInactive: true });
}

export type { RateTable, RateTableRow, CarrierProfile };
