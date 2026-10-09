// Importación de un tarifario desde planilla (BARRIL COMPATIBILIDAD).
//
// Esta es la capa de compatibilidad que re-exporta TODAS las exportaciones públicas
// del módulo particionado `./rate-table-import/`. Los imports externos NO cambian.

export {
  analyzeRateTableSheet,
  findDuplicateKeys,
  parseRateTableSheet,
  type ParsedRateTable,
  type ParsedRateTableRow,
  type RateTableMapping,
  type RateTableProblem,
  type RateTableSheetAnalysis,
} from './rate-table-import';
