import { useMemo } from 'react';
import { findDuplicateKeys, parseRateTableSheet } from '../../../../lib/tarifas/rateTableImport';
import type { RateTable } from '../../../../lib/tarifas/types';
import type { ImportState } from './importRateTableState';

/** Lo que se deduce de la hoja elegida: encabezados, filas leídas, duplicadas y si ya se puede importar. */
export function useImportParsing(table: RateTable | null, state: ImportState) {
  const matrix = useMemo(() => state.sheets[state.sheetIndex]?.matrix ?? [], [state.sheets, state.sheetIndex]);

  const headers = useMemo(() => {
    const width = Math.max(0, ...matrix.map((r) => r.length));
    return Array.from({ length: width }, (_, i) => {
      const cell = matrix[state.headerRow]?.[i];
      return cell === null || cell === undefined || String(cell).trim() === ''
        ? `Columna ${i + 1}`
        : String(cell).trim();
    });
  }, [matrix, state.headerRow]);

  const parsed = useMemo(
    () => table ? parseRateTableSheet(
      matrix, table.keyColumns, { firstDataRow: state.headerRow + 1, mapping: state.mapping }, state.numberFormat,
    ) : { rows: [], skipped: [] },
    [matrix, table, state.headerRow, state.mapping, state.numberFormat],
  );

  const duplicadas = useMemo(() => findDuplicateKeys(parsed.rows), [parsed.rows]);

  const columnOptions = [
    { value: '', label: 'Sin asignar' },
    ...headers.map((h, i) => ({ value: String(i), label: `${i + 1} · ${h}` })),
  ];

  const hasIssues = parsed.skipped.length > 0 || duplicadas.length > 0;
  const canImport = state.mapping.amount !== null && parsed.rows.length > 0
    && (!hasIssues || state.acknowledgeIssues)
    && (state.mode === 'merge' || state.confirmReplace);

  return { headers, parsed, duplicadas, columnOptions, hasIssues, canImport };
}
