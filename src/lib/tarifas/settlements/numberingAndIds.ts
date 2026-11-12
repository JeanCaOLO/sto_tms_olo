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

// Tamaño de página al leer los números ya emitidos. El servidor topa cada consulta en 5000 filas SIN
// avisar: leer "todas" de un país con más liquidaciones daba un máximo equivocado, un número repetido
// y la emisión bloqueada por el índice único (country_id, number). Se pagina por cursor hasta agotar.
const NUMBER_PAGE = 2000;

async function existingNumbers(countryId: string): Promise<string[]> {
  const numbers: string[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await db().find('settlement', {
      where: [{ column: 'country_id', op: 'eq', value: countryId }],
      columns: ['id', 'number'],
      orderBy: [{ column: 'id', direction: 'asc' }],
      limit: NUMBER_PAGE,
      ...(after === null ? {} : { after: { id: after } }),
    });
    numbers.push(...page.map((r) => String(r.number)));
    if (page.length < NUMBER_PAGE) return numbers;
    after = String(page[page.length - 1]!.id);
  }
}

export async function nextNumber(countryId: string): Promise<string> {
  // Solo las columnas necesarias (antes traía cada liquidación entera, con sus JSONB, para sacar un máximo).
  const [numbers, countries] = await Promise.all([
    existingNumbers(countryId),
    findMany(db(), [{ entity: 'country', options: { where: [{ column: 'id', op: 'eq', value: countryId }], limit: 1 } }]),
  ]);
  const country = countries[0]?.[0];
  return nextSettlementNumber(numbers, country ? String(country.code ?? '') : null);
}
