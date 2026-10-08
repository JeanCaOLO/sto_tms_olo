// Extracción de filas de tarifario desde planilla.

import { parseAmount, type NumberFormat, type SheetMatrix } from '../cost-sheet-parser';
import { RATE_TABLE_WILDCARD } from '../types';
import type { ParsedRateTable, ParsedRateTableRow, RateTableProblem, RateTableSheetAnalysis } from './types';
import { text } from './utils';

/** Procesa los valores adicionales de una fila. */
function parseCustomValues(
  row: SheetMatrix[number],
  valueMapping: Record<string, number | null> | undefined,
  format: NumberFormat,
): Record<string, string> {
  const values: Record<string, string> = {};
  if (!valueMapping) return values;

  for (const [name, columna] of Object.entries(valueMapping)) {
    if (columna === null || columna === undefined) continue;
    const leido = parseAmount(text(row[columna]), format);
    if (leido !== null) values[name] = leido;
  }
  return values;
}

/** Construye la clave de la fila, reemplazando vacíos con comodín. */
function buildKey(row: SheetMatrix[number], keyIndices: (number | null)[]): string[] {
  return keyIndices.map((idx) => {
    const value = idx === null || idx === undefined ? '' : text(row[idx]);
    return value === '' ? RATE_TABLE_WILDCARD : value;
  });
}

/**
 * Convierte la planilla en filas de tarifario.
 * Una celda de clave vacía queda como comodín (*).
 * Las filas sin importe legible se apartan con su motivo.
 */
export function parseRateTableSheet(
  matrix: SheetMatrix,
  keyColumns: string[],
  analysis: Pick<RateTableSheetAnalysis, 'firstDataRow' | 'mapping'>,
  format: NumberFormat = 'auto',
): ParsedRateTable {
  const { mapping, firstDataRow } = analysis;
  const rows: ParsedRateTableRow[] = [];
  const skipped: RateTableProblem[] = [];

  if (mapping.amount === null) return { rows, skipped };

  for (let i = firstDataRow; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    if (row.every((c) => text(c) === '')) continue;

    const key = buildKey(row, mapping.key);
    const rawAmount = text(row[mapping.amount]);
    const amount = parseAmount(rawAmount, format);

    if (amount === null) {
      // Salta líneas de separación (clave toda en comodines, sin importe).
      if (key.every((v) => v === RATE_TABLE_WILDCARD)) continue;
      skipped.push({
        sourceRow: i,
        key,
        reason: rawAmount ? `El importe "${rawAmount}" no es un número.` : 'Sin importe.',
      });
      continue;
    }

    const values = parseCustomValues(row, mapping.values, format);

    rows.push({
      key,
      amount,
      rawAmount,
      ...(Object.keys(values).length ? { values } : {}),
      sourceRow: i,
    });
  }

  return { rows, skipped };
}

/**
 * Detecta claves repetidas en el archivo.
 * Importan porque dos filas con la misma clave tienen igual especificidad
 * y el motor elegiría una por orden.
 */
export function findDuplicateKeys(rows: ParsedRateTableRow[]): string[][] {
  const vistas = new Map<string, number>();
  const repetidas: string[][] = [];

  for (const row of rows) {
    const huella = row.key.map((v) => v.toUpperCase()).join(' | ');
    const previas = vistas.get(huella) ?? 0;
    if (previas === 1) repetidas.push(row.key);
    vistas.set(huella, previas + 1);
  }

  return repetidas;
}
