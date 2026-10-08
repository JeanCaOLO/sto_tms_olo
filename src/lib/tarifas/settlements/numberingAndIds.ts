// Generación de IDs y números de liquidación.

import { db } from '../data';

/** Siguiente número de liquidación del país: `LIQ-0001`. */
export function nextSettlementNumber(existentes: string[]): string {
  const maximo = existentes.reduce((max, numero) => {
    const match = /^LIQ-(\d+)$/.exec((numero ?? '').trim());
    if (!match) return max;
    const valor = Number(match[1]);
    return Number.isFinite(valor) && valor > max ? valor : max;
  }, 0);

  return `LIQ-${String(maximo + 1).padStart(4, '0')}`;
}

export function newSettlementId(): string {
  return `stl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function nextNumber(countryId: string): Promise<string> {
  const rows = await db().find('settlement', { where: [{ column: 'country_id', op: 'eq', value: countryId }] });
  return nextSettlementNumber(rows.map((r) => String(r.number)));
}
