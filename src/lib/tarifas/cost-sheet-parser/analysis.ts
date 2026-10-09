// Análisis de estructura de una planilla de costos.

import type { CostDriver } from '../types';
import type { SheetMatrix } from './types';
import { detectCurrency, detectDriver, detectHeaderRow } from './detection';
import { isBlank, looksLikeNumber, text } from './utils';

export type TargetField = 'label' | 'amount' | 'unit' | 'code' | 'ignore';

export interface ColumnCandidate {
  index: number;
  /** Encabezado tal como aparece en la planilla. */
  header: string;
  /** Qué parece contener, mirando las filas de datos. */
  kind: 'text' | 'number' | 'mixed' | 'empty';
  /** Campo propuesto. La persona puede cambiarlo. */
  suggested: TargetField;
  /** Primeros valores, para que se vea qué se está mapeando. */
  sample: (string | number | null)[];
}

export interface SheetAnalysis {
  /** Índice de la fila que parece ser encabezado. -1 si no se encontró. */
  headerRow: number;
  /** Primera fila de datos. */
  firstDataRow: number;
  columns: ColumnCandidate[];
  /** Moneda deducida del encabezado, si se pudo. */
  detectedCurrency: string | null;
  /** Driver propuesto para toda la hoja. */
  suggestedDriver: CostDriver;
  notes: string[];
}

const MAYORIA = 0.7; // Clasificación por mayoría de celdas.

/** Clasifica una columna por tipo de contenido mayoritario. */
function classifyColumn(values: (string | number | null)[]): ColumnCandidate['kind'] {
  const filled = values.filter((v) => !isBlank(v));
  if (filled.length === 0) return 'empty';

  const numbers = filled.filter((v) => looksLikeNumber(v)).length;
  const ratio = numbers / filled.length;

  if (ratio >= MAYORIA) return 'number';
  if (ratio <= 1 - MAYORIA) return 'text';
  return 'mixed';
}

/** Propone mapeo de columnas: primera de texto como etiqueta, primera numérica como importe. */
function proposeMapping(columns: ColumnCandidate[]): void {
  let labelAssigned = false;
  let amountAssigned = false;

  for (const col of columns) {
    let suggested: ColumnCandidate['suggested'] = 'ignore';
    if (!labelAssigned && col.kind === 'text') {
      suggested = 'label';
      labelAssigned = true;
    } else if (!amountAssigned && col.kind === 'number') {
      suggested = 'amount';
      amountAssigned = true;
    }
    col.suggested = suggested;
  }
}

/** Detecta problemas en la estructura de la planilla. */
function detectIssues(
  labelAssigned: boolean,
  amountAssigned: boolean,
  headerRow: number,
  notes: string[],
): void {
  if (headerRow === -1) {
    notes.push('No se encontró una fila de encabezado: elegila a mano antes de importar.');
  } else if (headerRow > 0) {
    notes.push(`Se salteó${headerRow > 1 ? 'n' : ''} ${headerRow} fila(s) de título antes del encabezado.`);
  }

  if (!labelAssigned) notes.push('No se detectó una columna de texto para el concepto.');
  if (!amountAssigned) notes.push('No se detectó ninguna columna numérica para el importe.');
}

/**
 * Analiza la estructura de una planilla detectando encabezados, columnas y propiedades.
 * Devuelve candidatos para mapeo manual; la persona confirma o corrige.
 */
export function analyzeSheet(matrix: SheetMatrix): SheetAnalysis {
  const notes: string[] = [];
  const headerRow = detectHeaderRow(matrix);
  const firstDataRow = headerRow === -1 ? 0 : headerRow + 1;

  const width = Math.max(0, ...matrix.map((r) => r.length));
  const dataRows = matrix.slice(firstDataRow);

  const columns: ColumnCandidate[] = [];
  for (let col = 0; col < width; col += 1) {
    const values = dataRows.map((r) => r[col] ?? null);
    const kind = classifyColumn(values);
    const header = headerRow === -1 ? `Columna ${col + 1}` : text(matrix[headerRow]?.[col]) || `Columna ${col + 1}`;
    columns.push({ index: col, header, kind, suggested: 'ignore', sample: values.slice(0, 3) });
  }

  proposeMapping(columns);

  const labelAssigned = columns.some((c) => c.suggested === 'label');
  const amountAssigned = columns.some((c) => c.suggested === 'amount');
  detectIssues(labelAssigned, amountAssigned, headerRow, notes);

  const headerTexts = (matrix[headerRow] ?? []).map(text);
  const titleTexts = matrix.slice(0, Math.max(headerRow, 0)).flat().map(text);

  return {
    headerRow,
    firstDataRow,
    columns,
    detectedCurrency: detectCurrency([...titleTexts, ...headerTexts]),
    suggestedDriver: detectDriver([...titleTexts, ...headerTexts]),
    notes,
  };
}
