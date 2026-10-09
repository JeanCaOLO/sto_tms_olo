// Extracción y normalización de filas de costos desde planillas.

import type { CostDriver } from '../types';
import type { SheetMatrix } from './types';
import type { SheetAnalysis } from './analysis';
import { isBlank, parseAmount, text } from './utils';

export interface ColumnMapping {
  label: number | null;
  amount: number | null;
  unit: number | null;
  code: number | null;
}

export interface ParsedCostRow {
  code: string;
  label: string;
  amount: string;
  unit: string | null;
  driver: CostDriver;
  sourceRow: number;
}

export interface ParseProblem {
  sourceRow: number;
  label: string;
  reason: string;
}

export interface ParseResult {
  rows: ParsedCostRow[];
  skipped: ParseProblem[];
}

const TOTAL_PATTERN = /^\s*(total|suma|subtotal|gran total)\b/i;

/** Código estable desde etiqueta: sin tildes, sin espacios, mayúsculas, ≤40 chars. */
export function codeFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 40) || 'FILA';
}

/** Detecta si una etiqueta es una fila de total. */
function isTotal(label: string): boolean {
  return TOTAL_PATTERN.test(label);
}

/** Verifica si una fila está completamente vacía. */
function isEmptyRow(row: SheetMatrix[number], labelIdx: number | null, amountIdx: number | null): boolean {
  const label = labelIdx === null ? '' : text(row[labelIdx]);
  const amount = amountIdx === null ? null : row[amountIdx] ?? null;
  return !label && isBlank(amount);
}

/** Genera código único evitando duplicados. */
function makeUniqueCode(baseCode: string, seenCodes: Set<string>): string {
  if (!seenCodes.has(baseCode)) return baseCode;
  let n = 2;
  while (seenCodes.has(`${baseCode}_${n}`)) n += 1;
  return `${baseCode}_${n}`;
}

/** Extrae datos de una fila y valida cantidad mínima. */
function extractRowData(
  row: SheetMatrix[number],
  mapping: ColumnMapping,
  sourceRow: number,
): { label: string; amount: string | null; unit: string | null } | null {
  const label = mapping.label === null ? '' : text(row[mapping.label]);
  const rawAmount = mapping.amount === null ? null : row[mapping.amount] ?? null;

  if (!label && isBlank(rawAmount)) return null; // Fila vacía, no es problema

  if (!label) {
    return null; // Sin concepto, será reportada como error
  }

  const amount = parseAmount(rawAmount);
  if (amount === null) {
    return null; // Sin importe válido
  }

  const unit = mapping.unit === null ? null : text(row[mapping.unit]) || null;
  return { label, amount, unit };
}

/** Reporta un problema con una fila. */
function skipRow(
  skipped: ParseProblem[],
  sourceRow: number,
  label: string,
  reason: string,
): void {
  skipped.push({ sourceRow, label, reason });
}

/** Procesa una fila individual: validación y extracción de datos. */
function processRow(
  row: SheetMatrix[number],
  mapping: ColumnMapping,
  sourceRow: number,
  seenCodes: Set<string>,
  driver: CostDriver,
  skipped: ParseProblem[],
): ParsedCostRow | null {
  const label = mapping.label === null ? '' : text(row[mapping.label]);

  if (!label) {
    skipRow(skipped, sourceRow, '(sin concepto)', 'La fila no tiene concepto.');
    return null;
  }
  if (isTotal(label)) {
    skipRow(skipped, sourceRow, label, 'Es una fila de total: sumarla duplicaría el resto.');
    return null;
  }

  const rawAmount = mapping.amount === null ? null : row[mapping.amount] ?? null;
  const amount = parseAmount(rawAmount);
  if (amount === null) {
    skipRow(skipped, sourceRow, label, 'El importe no es un número.');
    return null;
  }

  const codeFromMapping = mapping.code !== null && text(row[mapping.code])
    ? codeFromLabel(text(row[mapping.code]))
    : codeFromLabel(label);
  const code = makeUniqueCode(codeFromMapping, seenCodes);
  seenCodes.add(code);

  const unit = mapping.unit === null ? null : text(row[mapping.unit]) || null;

  return { code, label, amount, unit, driver, sourceRow };
}

/**
 * Convierte matriz en filas de costos estructuradas.
 * Valida: concepto, importe, ausencia de totales, códigos únicos.
 */
export function parseCostRows(
  matrix: SheetMatrix,
  analysis: Pick<SheetAnalysis, 'firstDataRow'>,
  mapping: ColumnMapping,
  driver: CostDriver,
): ParseResult {
  const rows: ParsedCostRow[] = [];
  const skipped: ParseProblem[] = [];
  const seenCodes = new Set<string>();

  for (let i = analysis.firstDataRow; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    if (isEmptyRow(row, mapping.label, mapping.amount)) continue;

    const result = processRow(row, mapping, i + 1, seenCodes, driver, skipped);
    if (result) rows.push(result);
  }

  return { rows, skipped };
}
