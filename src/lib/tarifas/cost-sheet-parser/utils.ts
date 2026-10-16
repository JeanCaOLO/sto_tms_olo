// Utilidades de celda y conversión numérica para análisis de planillas.
// Módulo PURO: no importa librerías externas de forma dinámica.

import Decimal from 'decimal.js';

export type NumberFormat = 'auto' | 'es' | 'en';

/** Verifica si una celda está vacía. */
export function isBlank(cell: string | number | null | undefined): boolean {
  return cell === null || cell === undefined || String(cell).trim() === '';
}

/** Extrae texto de una celda, devolviendo string vacío si está en blanco. */
export function text(cell: string | number | null | undefined): string {
  return isBlank(cell) ? '' : String(cell).trim();
}

/** Convierte texto ya normalizado a Money con Decimal; null si no es número. */
function decimalToMoney(textVal: string, negate: boolean): string | null {
  try {
    const value = new Decimal(textVal);
    if (!value.isFinite()) return null;
    if (value.isZero()) return '0';
    return (negate ? value.negated() : value).toFixed();
  } catch {
    return null;
  }
}

/**
 * Convierte una celda a número decimal EN TEXTO.
 * Devuelve null si no es un número o no se puede interpretar.
 *
 * Acepta: separadores de miles, coma decimal, símbolo de moneda,
 * paréntesis para negativos y espacios. Se devuelve string para preservar precisión.
 */
export function parseAmount(
  cell: string | number | null | undefined,
  format: NumberFormat = 'auto',
): string | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? decimalToMoney(String(cell), false) : null;

  let raw = String(cell).trim();
  if (!raw) return null;

  const negativeByParens = /^\(.*\)$/.test(raw);
  if (negativeByParens) raw = raw.slice(1, -1);

  // Quita símbolos de moneda, espacios y caracteres especiales.
  raw = raw.replace(/[^\d,.\-]/g, '');
  if (!raw || raw === '-') return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');

  if (format === 'es') {
    raw = raw.replace(/\./g, '');
    if (raw.includes(',')) raw = raw.replace(/,(?=[^,]*$)/, '.').replace(/,/g, '');
  } else if (format === 'en') {
    raw = raw.replace(/,/g, '');
  } else if (lastComma > -1 && lastDot > -1) {
    // Ambos presentes: el más a la derecha es decimal.
    if (lastComma > lastDot) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Solo coma: decimal si deja 1-2 dígitos a la derecha.
    const decimals = raw.length - lastComma - 1;
    raw = decimals > 0 && decimals <= 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
  }

  return decimalToMoney(raw, negativeByParens);
}

/** Verificación ESTRICTA: una celda con letras no es número, aunque tenga dígitos. */
export function looksLikeNumber(cell: string | number | null): boolean {
  if (typeof cell === 'number') return Number.isFinite(cell);
  if (isBlank(cell)) return false;
  if (/\p{L}/u.test(String(cell))) return false;
  return parseAmount(cell) !== null;
}

/** Alias para compatibilidad. */
export function looksNumeric(cell: string | number | null): boolean {
  return looksLikeNumber(cell);
}
