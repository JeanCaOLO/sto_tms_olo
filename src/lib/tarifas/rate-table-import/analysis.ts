// Análisis de estructura de una planilla de tarifario.

import { detectHeaderRow, type SheetMatrix } from '../cost-sheet-parser';
import type { VarKey } from '../types';
import type { RateTableSheetAnalysis } from './types';
import {
  AMOUNT_HINTS, findHeaderByHints, findLastNumericColumn, fold, hintsOf, text,
} from './utils';

/** Propone mapeo reconociendo encabezados y tipos de contenido. */
export function analyzeRateTableSheet(
  matrix: SheetMatrix,
  keyColumns: VarKey[],
  customLabels: Record<string, string> = {},
  valueColumns: string[] = [],
): RateTableSheetAnalysis {
  const headerRow = detectHeaderRow(matrix);
  const headers = (matrix[headerRow] ?? []).map(text);
  const firstDataRow = headerRow + 1;
  const notes: string[] = [];

  const usadas = new Set<number>();

  // Busca las columnas de clave.
  const key = keyColumns.map((column) => {
    const hints = hintsOf(column, customLabels);
    return findHeaderByHints(headers, hints, usadas);
  });

  // Busca las columnas de valores adicionales.
  const values: Record<string, number | null> = {};
  for (const name of valueColumns) {
    values[name] = findHeaderByHints(headers, [fold(name)], usadas);
  }

  // Intenta localizar el importe.
  let amount = findHeaderByHints(headers, AMOUNT_HINTS, usadas);
  if (amount === null) {
    amount = findLastNumericColumn(matrix, firstDataRow, usadas);
    if (amount !== null) {
      notes.push('Ningún encabezado nombra el importe: se tomó la última columna con números.');
    }
  }

  // Fallback: sin encabezados reconocibles, propone las primeras columnas.
  if (key.every((k) => k === null) && headers.length >= keyColumns.length) {
    for (let i = 0; i < keyColumns.length; i += 1) {
      if (i !== amount) key[i] = i;
    }
    notes.push('No se reconoció ningún encabezado: se propusieron las primeras columnas en orden.');
  }

  // Advierte sobre columnas sin mapear.
  const sinMapear = keyColumns.filter((_c, i) => key[i] === null).length;
  if (sinMapear > 0) {
    notes.push(`${sinMapear} columna${sinMapear === 1 ? '' : 's'} de la clave sin asignar: revisá el mapeo.`);
  }

  return {
    headerRow, firstDataRow, headers, mapping: { key, amount, ...(valueColumns.length ? { values } : {}) }, notes,
  };
}
