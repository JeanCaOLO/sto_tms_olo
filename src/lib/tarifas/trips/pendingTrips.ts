// Viajes pendientes de liquidación.

import { tripProgress } from '../tripOrders';
import { toTripRecord } from '../tripContext';
import {
  findTrips, listLiquidableTrips, SIN_LIQUIDACION, whereOf, withVigentes,
  type TripFilter, type TripListOptions,
} from './queryHelpers';

/** Qué viajes mostrar en la bandeja. */
export type TripScope =
  /** Completados y 100 % entregados, sin liquidación vigente: los que se pueden liquidar sin dudas. */
  | 'ready'
  /** Sin liquidación vigente y con algo pendiente (no completados o con pedidos sin entregar): para auditar. */
  | 'incomplete'
  /** Todos los que no tienen liquidación vigente (menos los anulados). */
  | 'all';

/**
 * Viajes sin liquidación vigente según `scope`. Los viajes anulados en guía de despacho nunca se
 * listan: no hay nada que auditar de ellos.
 */
export async function listPendingTrips(
  scope: TripScope,
  filter: Omit<TripFilter, 'status'> = {},
  options: TripListOptions = {},
) {
  if (scope === 'ready') {
    return (await listLiquidableTrips(filter, options)).filter((t) => tripProgress(t).complete);
  }
  const rows = await findTrips(
    [...whereOf(filter), SIN_LIQUIDACION, { column: 'status', op: 'neq', value: 'cancelled' }],
    options,
  );
  const trips = (await withVigentes(rows.map(toTripRecord))).filter((t) => !t.settlementId && t.status !== 'cancelled');
  return scope === 'incomplete' ? trips.filter((t) => !tripProgress(t).complete) : trips;
}
