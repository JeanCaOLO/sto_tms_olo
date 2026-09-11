import type { Row } from './registry';

/**
 * Filtro de texto libre sobre las columnas visibles. Divide la consulta en
 * términos por espacios; una fila pasa si CADA término aparece (sin distinguir
 * mayúsculas ni acentos) en alguna celda. Puro y testeable.
 */
export function filterRows(rows: Row[], query: string, keys: string[]): Row[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows;
  return rows.filter((row) => {
    const hay = keys.map((k) => normalize(String(row[k] ?? ''))).join(' ');
    return terms.every((t) => hay.includes(t));
  });
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
