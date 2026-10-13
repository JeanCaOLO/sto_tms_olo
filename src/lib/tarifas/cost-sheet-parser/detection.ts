// Detección de estructura y propiedades de una planilla de costos.

import type { CostDriver } from '../types';
import type { SheetMatrix } from './types';
import { isBlank, looksNumeric, text } from './utils';

/**
 * Busca la fila de encabezado.
 * Criterio: primera fila con ≥2 celdas de texto no vacías cuya fila siguiente
 * tenga ≥1 número. Distingue encabezado de título suelto.
 */
export function detectHeaderRow(matrix: SheetMatrix): number {
  for (let i = 0; i < Math.min(matrix.length - 1, 25); i += 1) {
    const row = matrix[i] ?? [];
    const textCells = row.filter((c) => !isBlank(c) && !looksNumeric(c));
    if (textCells.length < 2) continue;

    const next = matrix[i + 1] ?? [];
    if (next.some((c) => looksNumeric(c))) return i;
  }
  return -1;
}

const CURRENCY_HINTS: { pattern: RegExp; currency: string }[] = [
  { pattern: /₡|colon|crc/i, currency: 'CRC' },
  { pattern: /\$|usd|dolar|dólar/i, currency: 'USD' },
  { pattern: /cop|peso colombiano/i, currency: 'COP' },
];

/** Deduce la moneda del encabezado o títulos. Devuelve null si no se reconoce. */
export function detectCurrency(texts: string[]): string | null {
  const joined = texts.join(' ');
  return CURRENCY_HINTS.find((h) => h.pattern.test(joined))?.currency ?? null;
}

const DRIVER_HINTS: { pattern: RegExp; driver: CostDriver }[] = [
  { pattern: /por\s*km|\/\s*km|kil[oó]metro/i, driver: 'PER_KM' },
  { pattern: /mensual|por\s*mes|\/\s*mes/i, driver: 'PER_MONTH_PRORATED' },
  { pattern: /diario|por\s*d[ií]a|\/\s*d[ií]a/i, driver: 'PER_DAY' },
  { pattern: /por\s*hora|\/\s*hora/i, driver: 'PER_HOUR' },
  { pattern: /por\s*parada|por\s*cliente|por\s*entrega/i, driver: 'PER_CLIENT' },
];

/** Deduce el driver (FIXED es el default) mirando títulos y encabezados. */
export function detectDriver(texts: string[]): CostDriver {
  const joined = texts.join(' ');
  return DRIVER_HINTS.find((h) => h.pattern.test(joined))?.driver ?? 'FIXED';
}
