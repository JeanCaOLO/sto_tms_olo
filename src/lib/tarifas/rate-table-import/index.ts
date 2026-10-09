// Importación de un tarifario desde planilla.
//
// Se diferencia de rateImport en que la forma del archivo es flexible: una columna por cada
// variable de su clave, más el importe. Un tarifario de zonas trae dos columnas de clave;
// uno de zona+camión+servicio trae tres.
//
// Módulo PURO: recibe una matriz de celdas, no un archivo.

export { analyzeRateTableSheet } from './analysis';
export { findDuplicateKeys, parseRateTableSheet } from './parsing';
export type { ParsedRateTable, ParsedRateTableRow, RateTableMapping, RateTableProblem, RateTableSheetAnalysis } from './types';
