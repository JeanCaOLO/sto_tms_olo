// Consultas de viajes.

import { db, type Condition, type Row } from '../data';
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

export function whereOf(filter: TripFilter): Condition[] {
  const where: Condition[] = [];
  if (filter.countryId) where.push({ column: 'country_id', op: 'eq', value: filter.countryId });
  if (filter.carrierId) where.push({ column: 'carrier_id', op: 'eq', value: filter.carrierId });
  if (filter.status) where.push({ column: 'status', op: 'eq', value: filter.status });
  if (filter.from) where.push({ column: 'route_date', op: 'gte', value: filter.from });
  if (filter.to) where.push({ column: 'route_date', op: 'lte', value: filter.to });
  return where;
}

interface SettlementFlags { vigente: Map<string, string>; conAnulada: Set<string> }

/** Una sola consulta con las liquidaciones de esos viajes (vigentes y anuladas). */
async function settlementFlags(tripIds: string[]): Promise<SettlementFlags> {
  const vigente = new Map<string, string>();
  const conAnulada = new Set<string>();
  if (tripIds.length === 0) return { vigente, conAnulada };
  const delViaje = await db().find('settlement', {
    where: [{ column: 'trip_id', op: 'in', value: tripIds }],
    // Solo se necesitan estos campos: sin esto traía cada liquidación entera con sus JSONB.
    columns: ['id', 'trip_id', 'status'],
  });
  for (const s of delViaje) {
    if (s.status === 'Anulado') conAnulada.add(String(s.trip_id));
    else vigente.set(String(s.trip_id), String(s.id));
  }
  return { vigente, conAnulada };
}

/** La vigente da `settlementId` y, si hubo alguna anulada, se marca para que la bandeja lo diga. */
function applyFlags(trips: TripRecord[], flags: SettlementFlags): TripRecord[] {
  return trips.map((t) => ({
    ...t,
    settlementId: flags.vigente.get(t.id) ?? null,
    ...(flags.conAnulada.has(t.id) ? { hadAnnulledSettlement: true } : {}),
  }));
}

/**
 * Completa `settlementId` con la liquidación VIGENTE de cada viaje, leída de las liquidaciones.
 */
export async function withVigentes(trips: TripRecord[]): Promise<TripRecord[]> {
  if (trips.length === 0) return trips;
  return applyFlags(trips, await settlementFlags(trips.map((t) => t.id)));
}

export const ORDEN = [
  { column: 'route_date', direction: 'desc' as const },
  { column: 'route_number', locale: true },
];

export async function listTrips(filter: TripFilter = {}): Promise<TripRecord[]> {
  const rows = await db().find('trip', { where: whereOf(filter), orderBy: ORDEN });
  return withVigentes(rows.map(toTripRecord));
}

/**
 * Condición que descarta en el servidor los viajes que ya tienen liquidación vigente. En Aurora la
 * vista trae `settlement_id` al día; con el almacén en memoria esa columna no se llena y el filtro no
 * descarta nada. Por eso es solo un PREFILTRO: lo que decide si un viaje está liquidado sigue siendo
 * `withVigentes`. Sin esto, cada carga de la bandeja traía todo el historial de viajes (hasta el tope de 5000).
 */
export const SIN_LIQUIDACION: Condition = { column: 'settlement_id', op: 'isNull' };

/** Tope de viajes que trae la bandeja. Antes era el tope del servidor (5000) y se cortaba sin avisar. */
export const TRIPS_LIMIT = 2000;

export interface TripListOptions {
  /** Se llama si había más viajes que el tope: la lista está recortada y conviene acotarla con filtros. */
  onTruncated?: () => void;
}

/** Trae hasta `TRIPS_LIMIT` viajes; pide uno de más para saber si se recortó. */
export async function findTrips(where: Condition[], options: TripListOptions): Promise<Row[]> {
  const rows = await db().find('trip', { where, orderBy: ORDEN, limit: TRIPS_LIMIT + 1 });
  if (rows.length <= TRIPS_LIMIT) return rows;
  options.onTruncated?.();
  return rows.slice(0, TRIPS_LIMIT);
}

/** Viajes COMPLETADOS sin liquidación vigente: la bandeja "Viajes por liquidar". */
export async function listLiquidableTrips(
  filter: Omit<TripFilter, 'status'> = {},
  options: TripListOptions = {},
): Promise<TripRecord[]> {
  const rows = await findTrips(
    [...whereOf(filter), { column: 'status', op: 'eq', value: 'completed' }, SIN_LIQUIDACION],
    options,
  );
  return (await withVigentes(rows.map(toTripRecord))).filter(isLiquidable);
}

export async function getTrip(id: string): Promise<TripRecord | null> {
  // El viaje y sus liquidaciones son consultas independientes: van a la vez (una espera de red, no dos).
  const [row, flags] = await Promise.all([db().findOne('trip', id), settlementFlags([id])]);
  if (!row) return null;
  return applyFlags([toTripRecord(row)], flags)[0];
}

/** Paradas del viaje (guías), en orden de visita. Solo para mostrar el detalle. */
export async function listTripGuides(tripId: string) {
  return db().find('dispatchGuide', {
    where: [{ column: 'route_id', op: 'eq', value: tripId }],
    orderBy: [{ column: 'sequence_number' }],
  });
}
