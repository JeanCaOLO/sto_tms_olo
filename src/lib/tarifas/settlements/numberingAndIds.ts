// Generación de IDs y números de liquidación.

import { db, findMany } from '../data';

/**
 * Siguiente número de liquidación del país: `LIQ-VE-001`, `LIQ-CR-001`… (código del país en el medio,
 * para que un número se distinga a simple vista entre países). Sin código de país queda el formato
 * anterior, `LIQ-0001`.
 *
 * La cuenta continúa sobre las liquidaciones del país en CUALQUIER formato: las `LIQ-0007` ya
 * emitidas cuentan, y la siguiente es `LIQ-VE-008`.
 */
export function nextSettlementNumber(existentes: string[], countryCode?: string | null): string {
  const maximo = existentes.reduce((max, numero) => {
    const match = /^LIQ-(?:[A-Z0-9]+-)?(\d+)$/.exec((numero ?? '').trim());
    if (!match) return max;
    const valor = Number(match[1]);
    return Number.isFinite(valor) && valor > max ? valor : max;
  }, 0);

  const code = (countryCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code
    ? `LIQ-${code}-${String(maximo + 1).padStart(3, '0')}`
    : `LIQ-${String(maximo + 1).padStart(4, '0')}`;
}

export function newSettlementId(): string {
  return `stl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function nextNumber(countryId: string): Promise<string> {
  // Solo la columna del número (antes traía cada liquidación entera, con sus JSONB, para sacar un máximo),
  // y el país junto con ella en una sola llamada (/batch).
  const [rows, countries] = await findMany(db(), [
    { entity: 'settlement', options: { where: [{ column: 'country_id', op: 'eq', value: countryId }], columns: ['number'] } },
    { entity: 'country', options: { where: [{ column: 'id', op: 'eq', value: countryId }], limit: 1 } },
  ]);
  const country = countries[0];
  return nextSettlementNumber(rows.map((r) => String(r.number)), country ? String(country.code ?? '') : null);
}
