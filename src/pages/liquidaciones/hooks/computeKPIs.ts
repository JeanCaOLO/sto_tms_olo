// Pure function to compute KPIs from settlements (no React hooks).

import { formatCurrencyTotals } from '../../../lib/tarifas/format';
import type { SettlementRecord } from '../../../lib/tarifas/types';

export interface KPIs {
  total: string;
  pendiente: string;
}

export function computeKPIs(settlements: SettlementRecord[], currency: string): KPIs {
  const vigentes = settlements.filter((s) => s.status !== 'Anulado');
  const total = formatCurrencyTotals(vigentes, currency);
  const pendiente = formatCurrencyTotals(vigentes.filter((s) => s.status === 'Borrador' || s.status === 'En Revisión'), currency);
  return { total, pendiente };
}
