// Consultas de viajes.

import { db, type Condition } from '../data';
import { isLiquidable, toTripRecord } from '../tripContext';
import type { TripRecord } from '../types';

export interface TripFilter {
  countryId?: string;
  carrierId?: string;
  /** 'YYYY-MM-DD', inclusive. */
  from?: string;
  to?: string;
  /** Estado normalizado ('completed', 'planned'…). */
  status?: string;
}

function whereOf(filter: TripFilter): Condition[] {
  const where: Condition[] = [];
  if (filter.countryId) where.push({ column: 'country_id', op: 'eq', value: filter.countryId });
  if (filter.carrierId) where.push({ column: 'carrier_id', op: 'eq', value: filter.carrierId });
  if (filter.status) where.push({ column: 'status', op: 'eq', value: filter.status });
  if (filter.from) where.push({ column: 'route_date', op: 'gte', value: filter.from });
  if (filter.to) where.push({ column: 'route_date', op: 'lte', value: filter.to });
  return where;
}

/**
 * Completa `settlementId` con la liquidación VIGENTE de cada viaje, leída de las liquidaciones.
 */
async function withVigentes(trips: TripRecord[]): Promise<TripRecord[]> {
  if (trips.length === 0) return trips;
  const vigentes = await db().find('settlement', {
    where: [
      { column: 'trip_id', op: 'in', value: trips.map((t) => t.id) },
      { column: 'status', op: 'neq', value: 'Anulado' },
    ],
  });
  const porViaje = new Map(vigentes.map((s) => [String(s.trip_id), String(s.id)]));
  return trips.map((t) => ({ ...t, settlementId: porViaje.get(t.id) ?? null }));
}

const ORDEN = [
  { column: 'route_date', direction: 'desc' as const },
  { column: 'route_number', locale: true },
];

export async function listTrips(filter: TripFilter = {}): Promise<TripRecord[]> {
  const rows = await db().find('trip', { where: whereOf(filter), orderBy: ORDEN });
  return withVigentes(rows.map(toTripRecord));
}

/** Viajes COMPLETADOS sin liquidación vigente: la bandeja "Viajes por liquidar". */
export async function listLiquidableTrips(filter: Omit<TripFilter, 'status'> = {}): Promise<TripRecord[]> {
  const rows = await db().find('trip', {
    where: [...whereOf(filter), { column: 'status', op: 'eq', value: 'completed' }],
    orderBy: ORDEN,
  });
  return (await withVigentes(rows.map(toTripRecord))).filter(isLiquidable);
}

export async function getTrip(id: string): Promise<TripRecord | null> {
  const row = await db().findOne('trip', id);
  if (!row) return null;
  const [trip] = await withVigentes([toTripRecord(row)]);
  return trip;
}

/** Paradas del viaje (guías), en orden de visita. Solo para mostrar el detalle. */
export async function listTripGuides(tripId: string) {
  return db().find('dispatchGuide', {
    where: [{ column: 'route_id', op: 'eq', value: tripId }],
    orderBy: [{ column: 'sequence_number' }],
  });
}
