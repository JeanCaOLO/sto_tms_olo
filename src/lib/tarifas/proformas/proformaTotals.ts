// Total de una proforma: suma de las liquidaciones incluidas. Centavos enteros para no arrastrar error de coma flotante.

import type { ProformaItem } from './types';

export function proformaTotal(items: ProformaItem[]): number {
  const cents = items.filter((i) => i.included).reduce((sum, i) => sum + Math.round(i.amount * 100), 0);
  return cents / 100;
}

export function toggleItem(items: ProformaItem[], settlementId: string, included: boolean, reason: string | null): ProformaItem[] {
  if (!included && !reason?.trim()) throw new Error('Para excluir una liquidación indica el motivo.');
  return items.map((i) => (i.settlementId === settlementId
    ? { ...i, included, exclusionReason: included ? null : reason!.trim() }
    : i));
}
