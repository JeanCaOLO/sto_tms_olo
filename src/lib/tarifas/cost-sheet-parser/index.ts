// Lectura de planillas de estructura de costos.
//
// EL PROBLEMA REAL: ninguna planilla viene igual. La de ejemplo tiene 5 hojas y las 5 tienen forma
// distinta — una es de pares clave/valor, dos son tablas de 2 columnas, una de 4 y otra de 10, y en
// ninguna el encabezado está en la primera fila (arriba hay título y subtítulo). Un parser que
// asuma "columna A = concepto, columna B = monto" funciona solo con este archivo.
//
// Por eso acá no se interpreta NADA: se detectan candidatos y se propone un mapeo, que la persona
// confirma o corrige antes de importar. El módulo es PURO — recibe una matriz de celdas, no un
// archivo — así que se puede probar sin abrir un Excel.

// Re-exporta la API pública preservando compatibilidad con imports externos.

export { analyzeSheet, type ColumnCandidate, type SheetAnalysis, type TargetField } from './analysis';
export { detectCurrency, detectDriver, detectHeaderRow } from './detection';
export { codeFromLabel, parseCostRows, type ColumnMapping, type ParsedCostRow, type ParseProblem, type ParseResult } from './parsing';
export { isBlank, looksLikeNumber, looksNumeric, parseAmount, text, type NumberFormat } from './utils';
export type { SheetMatrix } from './types';
