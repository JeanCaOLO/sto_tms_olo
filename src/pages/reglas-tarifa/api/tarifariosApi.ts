// API para la gestión de tarifarios: orquesta rateTablesDataSource, partiesDataSource,
// localRulesDataSource y auditLog.

import {
  deleteRateRow,
  deleteRateTable,
  listRateTableRows,
  listRateTables,
  saveRateRow,
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
import { registrarEvento } from '../../../lib/liquidador/auditLog';
import { getActorRole } from '../../../lib/tarifas/actor';

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

export async function createOrUpdateRateRow(
  input: RateRowFormInput,
  editingRowId?: string,
): ReturnType<typeof saveRateRow> {
  return saveRateRow({ ...input }, editingRowId);
}

export async function getRateTableRows(tableId: string): Promise<RateTableRow[]> {
  return listRateTableRows(tableId);
}

export async function removeRateRow(rowId: string): Promise<{ error: string | null }> {
  return deleteRateRow(rowId);
}

export async function toggleRateTable(
  id: string,
  active: boolean,
): Promise<{ error: string | null }> {
  return setRateTableActive(id, !active);
}

export async function removeRateTable(id: string): Promise<{ error: string | null }> {
  return deleteRateTable(id);
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

    try {
      const table = await listRateTables('', { includeInactive: true }).then((t) =>
        t.find((x) => x.id === tableId),
      );
      await registrarEvento({
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
    } catch (err) {
      console.error('Error registrando evento de auditoría:', err);
    }

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
