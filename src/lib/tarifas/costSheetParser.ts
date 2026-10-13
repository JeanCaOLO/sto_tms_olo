// Lectura de planillas de estructura de costos (BARRIL COMPATIBILIDAD).
//
// Esta es la capa de compatibilidad que re-exporta TODAS las exportaciones públicas
// del módulo particionado `./cost-sheet-parser/`. Los imports externos NO cambian.
// Los tipos y funciones se importan exactamente con los mismos nombres.

export {
  analyzeSheet,
  codeFromLabel,
  detectCurrency,
  detectDriver,
  detectHeaderRow,
  isBlank,
  looksLikeNumber,
  looksNumeric,
  parseAmount,
  parseCostRows,
  text,
  type ColumnCandidate,
  type ColumnMapping,
  type NumberFormat,
  type ParseProblem,
  type ParseResult,
  type ParsedCostRow,
  type SheetAnalysis,
  type SheetMatrix,
  type TargetField,
} from './cost-sheet-parser';
