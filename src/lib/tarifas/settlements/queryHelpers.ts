// Consultas de liquidaciones.

import { db, type Condition } from '../data';
import { mapToDomain } from './mapToDomain';
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

export async function listSettlements(filter: SettlementFilter = {}): Promise<SettlementRecord[]> {
  const where: Condition[] = [];
  if (filter.countryId) where.push({ column: 'country_id', op: 'eq', value: filter.countryId });
  if (filter.partyId) where.push({ column: 'party_id', op: 'eq', value: filter.partyId });
  if (filter.tripId) where.push({ column: 'trip_id', op: 'eq', value: filter.tripId });
  if (filter.status) where.push({ column: 'status', op: 'eq', value: filter.status });
  if (filter.includeVoided === false) where.push({ column: 'status', op: 'neq', value: 'Anulado' });
  if (filter.from) where.push({ column: 'settlement_date', op: 'gte', value: filter.from });
  if (filter.to) where.push({ column: 'settlement_date', op: 'lte', value: filter.to });

  const rows = await db().find('settlement', {
    where,
    orderBy: [{ column: 'settlement_date', direction: 'desc' }, { column: 'number', direction: 'desc' }],
  });
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
