// Pure function to compute KPIs from settlements (no React hooks).

import { sumMoney, toDecimal } from '../../../lib/tarifas/money';
import type { SettlementRecord } from '../../../lib/tarifas/types';

export interface KPIs {
  total: string;
  pendiente: string;
}

export function computeKPIs(settlements: SettlementRecord[]): KPIs {
  const vigentes = settlements.filter((s) => s.status !== 'Anulado');
  const total = sumSettlementTotals(vigentes);
  const pendiente = sumSettlementTotals(vigentes.filter((s) => s.status === 'Borrador' || s.status === 'En Revisión'));
  return { total, pendiente };
}

function sumSettlementTotals(items: SettlementRecord[]): string {
  const decimals = Math.max(0, ...items.map((s) => toDecimal(s.totalAmount).decimalPlaces()));
  return sumMoney(items.map((s) => s.totalAmount)).toFixed(decimals);
}
