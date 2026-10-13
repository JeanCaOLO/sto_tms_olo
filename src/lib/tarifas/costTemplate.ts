// Plantilla base de la estructura de costos: un libro de 3 hojas que se descarga, se llena y se sube.
//
//   Variables   — componentes que se repiten (mantenimiento, llantas…): cuestan "costo por km".
//   Fijos       — importes mensuales (conductor, ayudante, depreciación…): se prorratean por día.
//   Parámetros  — días operativos, km por año, precio del combustible y rendimiento por camión.
//
// Este módulo es PURO: recibe las hojas como matrices y devuelve las filas listas para guardar, más
// todo lo que está mal o dudoso, con hoja y fila, para mostrarlo en una vista previa ANTES de
// guardar. Leer el archivo (xlsx/csv) es trabajo de la pantalla.
//
// NOTA: En versión particionada, este archivo es un BARREL que re-exporta todos los submodulos.

import { normalizeText } from '../text';
import type { CostStructureParams } from './types/cost';
import type { TemplateIssue } from './cost-template/parsing';
import type { TruckSummary } from './cost-template/summarization';
import type { CostRowInput } from './costStructureDataSource';

// Tipos y constantes
export type { SheetCell, SheetMatrix } from './cost-template/sheets';
export {
  SHEET_VARIABLES,
  SHEET_FIXED,
  SHEET_PARAMS,
  SHEET_HEADERS_VARIABLES,
  SHEET_HEADERS_FIXED,
  SHEET_HEADERS_PARAMS,
  FREQUENCY_ALIASES,
  GROUP_ALIASES,
  costTemplateSheets,
} from './cost-template/sheets';

// Tipos de parsing y issues
export type { TemplateIssue } from './cost-template/parsing';
export { parseParams, parseVariables, parseFixed } from './cost-template/parsing';

// Summarización
export type { TruckSummary } from './cost-template/summarization';
export { summarize } from './cost-template/summarization';

export interface ParsedCostTemplate {
  operatingDays: number | null;
  params: CostStructureParams;
  rows: CostRowInput[];
  errors: TemplateIssue[];
  warnings: TemplateIssue[];
  summary: TruckSummary[];
  truckTypes: string[];
}

// ── Orquestador ──────────────────────────────────────────────────────────────────────────────

import type { SheetMatrix } from './cost-template/sheets';
import { parseParams, parseVariables, parseFixed } from './cost-template/parsing';
import { summarize } from './cost-template/summarization';

/**
 * Parsea la plantilla de costos desde hojas de cálculo. Coordina la lectura de parámetros,
 * variables y costos fijos, luego genera un resumen.
 */
export function parseCostTemplate(
  sheets: Record<string, SheetMatrix>,
  options: { knownTruckTypes?: string[] } = {},
): ParsedCostTemplate {
  // Parsea parámetros (incluye cálculo inicial de tipos de camión)
  const state = parseParams(sheets);
  state.usedCodes = new Set<string>();

  // Parsea variables y fijos
  parseVariables(state, sheets);
  parseFixed(state, sheets);

  if (state.rows.length === 0 && state.errors.length === 0) {
    state.errors.push({ sheet: 'Variables', row: null, message: 'La plantilla no tiene ninguna fila de costo.' });
  }

  // Valida tipos de camión desconocidos
  if (options.knownTruckTypes && options.knownTruckTypes.length > 0) {
    const known = new Set(options.knownTruckTypes.map((t) => normalizeText(t)));
    const unknown = [...state.truckTypes].filter((t) => !known.has(normalizeText(t)));
    if (unknown.length > 0) {
      state.warnings.push({
        sheet: 'General',
        row: null,
        message: `Estos tipos de camión no existen en el catálogo de vehículos y nunca se aplicarán: ${unknown.join(', ')}.`,
      });
    }
  }

  const days = state.operatingDays ?? 0;
  return {
    operatingDays: state.operatingDays,
    params: state.params,
    rows: state.rows,
    errors: state.errors,
    warnings: state.warnings,
    summary: summarize(state.rows, state.params, days),
    truckTypes: [...state.truckTypes],
  };
}
