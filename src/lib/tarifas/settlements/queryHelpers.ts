// Consultas de liquidaciones.

import { db, entityDef, type Condition, type FindOptions } from '../data';
import { dateOnly, mapToDomain } from './mapToDomain';
import type { SettlementRecord, SettlementStatus } from '../types';

export interface SettlementFilter {
  countryId?: string;
  partyId?: string;
  tripId?: string;
  status?: SettlementStatus;
  /** false = oculta las anuladas. Por defecto se incluyen: es el historial. */
  includeVoided?: boolean;
  /** 'YYYY-MM-DD', inclusive. */
  from?: string;
  to?: string;
}

/**
 * Columnas pesadas (el cálculo completo): la tabla de liquidaciones no las muestra, así que el listado
 * no las trae. Al abrir el desglose o re-liquidar se lee la liquidación entera con `getSettlement`.
 */
const HEAVY_COLUMNS = new Set([
  'trace', 'discarded', 'stage_subtotals', 'warnings', 'overrides', 'adhoc_rules', 'rules_used',
  'excluded_seqs', 'base_change', 'returns', 'trip', 'trip_edits', 'allocation',
]);

function summaryColumns(): string[] {
  return Object.keys(entityDef('settlement').columns).filter((c) => !HEAVY_COLUMNS.has(c));
}

/**
 * Lo mismo que `listSettlements` pero SIN las columnas pesadas: los campos del cálculo vienen vacíos.
 * Para tablas y KPIs; para mostrar el desglose usar `getSettlement`.
 */
export async function listSettlementSummaries(filter: SettlementFilter = {}): Promise<SettlementRecord[]> {
  return listSettlements(filter, summaryColumns());
}

/** Filas por página del historial: lo más reciente primero; el resto se pide con `after`. */
export const SETTLEMENT_PAGE_SIZE = 500;

/** Dónde quedó la página anterior: la fecha y el número de su última liquidación. */
export interface SettlementCursor {
  settlement_date: string;
  number: string;
}

export interface SettlementPage {
  rows: SettlementRecord[];
  /** Pasalo como `after` para la página siguiente; null = no hay más. */
  next: SettlementCursor | null;
}

/**
 * Una página del historial, sin las columnas pesadas, de la más nueva a la más vieja. Paginación por
 * cursor (no `offset`): pedir la página 50 cuesta lo mismo que la primera.
 */
export async function listSettlementSummariesPage(
  filter: SettlementFilter = {},
  page: { limit?: number; after?: SettlementCursor | null } = {},
): Promise<SettlementPage> {
  const limit = page.limit ?? SETTLEMENT_PAGE_SIZE;
  // Se pide una de más para saber si hay página siguiente sin hacer otra consulta.
  const rows = await db().find('settlement', {
    ...settlementQuery(filter),
    columns: summaryColumns(),
    limit: limit + 1,
    ...(page.after ? { after: { ...page.after } } : {}),
  });
  const shown = rows.slice(0, limit);
  const last = shown[shown.length - 1];
  return {
    rows: shown.map(mapToDomain),
    next: rows.length > limit && last
      ? { settlement_date: dateOnly(last.settlement_date), number: String(last.number) }
      : null,
  };
}

function settlementQuery(filter: SettlementFilter): Pick<FindOptions, 'where' | 'orderBy'> {
  const where: Condition[] = [];
  if (filter.countryId) where.push({ column: 'country_id', op: 'eq', value: filter.countryId });
  if (filter.partyId) where.push({ column: 'party_id', op: 'eq', value: filter.partyId });
  if (filter.tripId) where.push({ column: 'trip_id', op: 'eq', value: filter.tripId });
  if (filter.status) where.push({ column: 'status', op: 'eq', value: filter.status });
  if (filter.includeVoided === false) where.push({ column: 'status', op: 'neq', value: 'Anulado' });
  if (filter.from) where.push({ column: 'settlement_date', op: 'gte', value: filter.from });
  if (filter.to) where.push({ column: 'settlement_date', op: 'lte', value: filter.to });

  return {
    where,
    orderBy: [{ column: 'settlement_date', direction: 'desc' }, { column: 'number', direction: 'desc' }],
  };
}

export async function listSettlements(
  filter: SettlementFilter = {},
  columns?: string[],
): Promise<SettlementRecord[]> {
  const rows = await db().find('settlement', { ...settlementQuery(filter), ...(columns ? { columns } : {}) });
  return rows.map(mapToDomain);
}

export async function getSettlement(id: string): Promise<SettlementRecord | null> {
  const row = await db().findOne('settlement', id);
  return row ? mapToDomain(row) : null;
}

/** Historial completo de un viaje: la vigente y las que reemplazó, de la más nueva a la más vieja. */
export async function listTripSettlements(tripId: string): Promise<SettlementRecord[]> {
  return listSettlements({ tripId });
}
