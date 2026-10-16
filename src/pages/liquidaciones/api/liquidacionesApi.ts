// Thin layer API for settlements data access.
// Abstracts datasources and provides typed methods for the liquidaciones module.

import {
  getSettlement,
  listSettlementSummariesPage,
  updateSettlementStatus,
  emitSettlement,
  reliquidateSettlement,
  type EmitSettlementResult,
  type SettlementCursor,
  type SettlementPage,
} from '../../../lib/tarifas/settlementsDataSource';
import { listPendingTrips, type TripListOptions } from '../../../lib/tarifas/tripsDataSource';
import type { SettlementRecord, SettlementStatus, TripRecord } from '../../../lib/tarifas/types';

export interface ListSettlementsParams {
  countryId: string;
  from?: string;
  to?: string;
}

export interface ListTripsParams {
  countryId: string;
  from?: string;
  to?: string;
}

export async function fetchPendingTrips(params: ListTripsParams, options: TripListOptions = {}): Promise<TripRecord[]> {
  return listPendingTrips('all', {
    countryId: params.countryId,
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  }, options);
}

/**
 * Una página del historial (las más recientes primero), sin el cálculo completo de cada liquidación
 * (trace, reglas, avisos…): la tabla no lo muestra. El desglose y re-liquidar leen la entera con
 * `fetchSettlement`.
 */
export async function fetchSettlementsPage(
  params: ListSettlementsParams,
  after?: SettlementCursor | null,
): Promise<SettlementPage> {
  return listSettlementSummariesPage({
    countryId: params.countryId,
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  }, after ? { after } : {});
}

export async function fetchSettlement(id: string): Promise<SettlementRecord | null> {
  return getSettlement(id);
}

export async function updateStatus(
  settlementId: string,
  status: SettlementStatus,
): Promise<{ error: string | null }> {
  return updateSettlementStatus(settlementId, status);
}

export async function emitNew(input: Parameters<typeof emitSettlement>[0]): Promise<EmitSettlementResult> {
  return emitSettlement(input);
}

export async function reliquidate(
  settlementId: string,
  input: Parameters<typeof reliquidateSettlement>[1],
  reason: string,
): Promise<EmitSettlementResult> {
  return reliquidateSettlement(settlementId, input, reason);
}
