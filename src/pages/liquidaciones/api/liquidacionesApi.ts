// Thin layer API for settlements data access.
// Abstracts datasources and provides typed methods for the liquidaciones module.

import {
  listSettlements,
  updateSettlementStatus,
  emitSettlement,
  reliquidateSettlement,
  type EmitSettlementResult,
} from '../../../lib/tarifas/settlementsDataSource';
import { listPendingTrips } from '../../../lib/tarifas/tripsDataSource';
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

export async function fetchPendingTrips(params: ListTripsParams): Promise<TripRecord[]> {
  return listPendingTrips('all', {
    countryId: params.countryId,
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  });
}

export async function fetchSettlements(params: ListSettlementsParams): Promise<SettlementRecord[]> {
  return listSettlements({
    countryId: params.countryId,
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
  });
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
