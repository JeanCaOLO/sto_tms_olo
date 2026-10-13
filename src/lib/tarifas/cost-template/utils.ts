// Utilidades compartidas del módulo cost-template para parsing de hojas de cálculo.

import { codeFromLabel, parseAmount } from '../costSheetParser';
import { normalizeText } from '../../text';
import type { SheetCell, SheetMatrix } from './sheets';

export function text(cell: SheetCell): string {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

/** Encuentra una hoja por nombre normalizado. */
export function findSheet(sheets: Record<string, SheetMatrix>, wanted: string): SheetMatrix | null {
  const target = normalizeText(wanted);
  const key = Object.keys(sheets).find((name) => normalizeText(name) === target);
  return key ? sheets[key] : null;
}

/** Mapea encabezados esperados a sus índices de columna. */
export function headerIndex(headerRow: SheetCell[], expected: string[]): Record<string, number> {
  const clean = (value: string) => normalizeText(value).replace(/[\s_-]+/g, '');
  const cells = headerRow.map((c) => clean(text(c)));
  const index: Record<string, number> = {};
  for (const name of expected) {
    const position = cells.indexOf(clean(name));
    if (position >= 0) index[name] = position;
  }
  return index;
}

/** Verifica si una fila está completamente vacía. */
export const isBlankRow = (row: SheetCell[]) => row.every((c) => text(c) === '');

/** Convierte celda a número decimal, null si no es válido. */
export function numberOf(cell: SheetCell): string | null {
  const parsed = parseAmount(typeof cell === 'boolean' ? null : cell);
  return parsed;
}

/** Genera código slug único a partir de partes de texto. */
export function slug(...parts: string[]): string {
  return codeFromLabel(parts.filter(Boolean).join(' '));
}
