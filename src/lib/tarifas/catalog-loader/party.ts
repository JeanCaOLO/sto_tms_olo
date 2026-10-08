// Carga de datos específicos de la compañía: variables, estructura de costos, tarifarios.

import { db, type Row } from '../data';
import { toCostStructure, toCostStructureRow } from '../costStructureDataSource';
import type { CostStructure, CostStructureRow, PartyVariable, RateTable, RateTableRow } from '../types';

const eq = (column: string, value: unknown) => ({ column, op: 'eq' as const, value });

async function loadPartyVariables(partyId: string | null): Promise<PartyVariable[]> {
  if (!partyId) return [];
  const rows = await db().find('partyVariable', { where: [eq('party_id', partyId)] });
  return rows.map((row) => ({
    id: row.id,
    partyId: row.party_id,
    key: row.key,
    label: row.label,
    kind: row.kind,
    origin: row.origin,
    defaultValue: row.default_value ?? null,
    unit: row.unit ?? null,
    active: !!row.active,
  }));
}

/**
 * Estructura activa de una compañía (`partyId`) o la estructura por defecto de un país (`countryId`,
 * la que no tiene compañía). Sin ninguno de los dos, nada.
 */
async function loadCostStructure(scope: { partyId?: string | null; countryId?: string }): Promise<{
  structure: CostStructure | null;
  rows: CostStructureRow[];
}> {
  const where = scope.partyId
    ? [eq('party_id', scope.partyId), eq('active', true)]
    : scope.countryId
      ? [{ column: 'party_id', op: 'isNull' as const }, eq('country_id', scope.countryId), eq('active', true)]
      : null;
  if (!where) return { structure: null, rows: [] };

  const [row] = await db().find('costStructure', { where, limit: 1 });
  if (!row) return { structure: null, rows: [] };

  const rows = await db().find('costStructureRow', { where: [eq('structure_id', row.id)] });
  return { structure: toCostStructure(row), rows: rows.map(toCostStructureRow) };
}

/**
 * Tarifarios del país MÁS los de la compañía. Los de otra compañía no se cargan: una regla no
 * debería poder mirar el tarifario de un tercero.
 */
async function loadRateTables(
  countryId: string,
  partyId: string | null,
): Promise<{ tables: RateTable[]; rows: RateTableRow[] }> {
  const all = await db().find('rateTable', { where: [eq('country_id', countryId), eq('active', true)] });

  const tables: RateTable[] = all
    .filter((t) => !t.party_id || t.party_id === partyId)
    .map((t) => ({
      id: t.id,
      countryId: t.country_id,
      partyId: t.party_id ?? null,
      code: t.code,
      name: t.name,
      keyColumns: t.key_columns ?? [],
      valueColumns: ((t.value_columns ?? []) as unknown[]).map(String),
      active: !!t.active,
    }));

  // Un tarifario de compañía con el MISMO código que uno de país lo reemplaza — mismo mecanismo
  // que el alcance de las reglas, para que no haya dos formas distintas de especializar.
  const codigosDeCompania = new Set(tables.filter((t) => t.partyId).map((t) => t.code));
  const vigentes = tables.filter((t) => t.partyId || !codigosDeCompania.has(t.code));

  const ids = vigentes.map((t) => t.id);
  const rows = ids.length
    ? await db().find('rateTableRow', { where: [{ column: 'table_id', op: 'in', value: ids }] })
    : [];

  return {
    tables: vigentes,
    rows: rows.map((r) => ({
      id: r.id,
      tableId: r.table_id,
      key: r.key ?? [],
      amount: String(r.amount),
      values: Object.fromEntries(
        Object.entries((r.extra_values ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      ),
      order: Number(r.row_order ?? 0),
      active: !!r.active,
    })),
  };
}

export async function loadPartyData(
  countryId: string,
  partyId: string | null,
): Promise<{
  partyVariables: PartyVariable[];
  costStructure: CostStructure | null;
  costStructureRows: CostStructureRow[];
  defaultCostStructure: CostStructure | null;
  defaultCostStructureRows: CostStructureRow[];
  rateTables: RateTable[];
  rateTableRows: RateTableRow[];
}> {
  const [
    partyVariables,
    cost,
    defaultCost,
    rateTables,
  ] = await Promise.all([
    loadPartyVariables(partyId),
    loadCostStructure({ partyId }),
    loadCostStructure({ countryId }),
    loadRateTables(countryId, partyId),
  ]);

  return {
    partyVariables,
    costStructure: cost.structure,
    costStructureRows: cost.rows,
    defaultCostStructure: defaultCost.structure,
    defaultCostStructureRows: defaultCost.rows,
    rateTables: rateTables.tables,
    rateTableRows: rateTables.rows,
  };
}
