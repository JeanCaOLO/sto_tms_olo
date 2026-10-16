// Tipos compartidos del módulo rate-table-import.

import type { VarKey } from '../types';

export interface RateTableMapping {
  /** Un índice por cada columna de la clave, en el mismo orden que `keyColumns`. */
  key: (number | null)[];
  amount: number | null;
  /** Columna de la planilla de cada columna de valor adicional del tarifario. */
  values?: Record<string, number | null>;
}

export interface RateTableSheetAnalysis {
  headerRow: number;
  firstDataRow: number;
  headers: string[];
  mapping: RateTableMapping;
  notes: string[];
}

export interface ParsedRateTableRow {
  key: string[];
  /** Decimal en texto, ya limpio de símbolos. */
  amount: string;
  /** Valor original de la celda del importe, para mostrarlo en vista previa. */
  rawAmount: string;
  /** Valores de las columnas adicionales del tarifario, por nombre. */
  values?: Record<string, string>;
  sourceRow: number;
}

export interface RateTableProblem {
  sourceRow: number;
  key: string[];
  reason: string;
}

export interface ParsedRateTable {
  rows: ParsedRateTableRow[];
  skipped: RateTableProblem[];
}
