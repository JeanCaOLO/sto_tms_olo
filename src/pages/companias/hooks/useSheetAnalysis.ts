import { useMemo } from 'react';
import {
  analyzeSheet, parseCostRows, type ColumnMapping, type SheetAnalysis,
} from '../../../lib/tarifas/costSheetParser';
import { sumMoney } from '../../../lib/tarifas/money';
import type { ImportWizardState } from './useImportWizardState';

/** Índice de la columna asignada a un destino, o null si ninguna lo tiene. */
const columnOf = (fields: ImportWizardState['fields'], target: string): number | null => {
  const index = fields.findIndex((f) => f === target);
  return index >= 0 ? index : null;
};

/** Lo que se deduce de la hoja elegida: encabezado, mapeo de columnas, filas leídas y su suma. */
export function useSheetAnalysis(state: ImportWizardState) {
  const matrix = useMemo(() => state.sheets[state.sheetIndex]?.matrix ?? [], [state.sheets, state.sheetIndex]);

  const analysis: SheetAnalysis = useMemo(() => {
    const base = analyzeSheet(matrix);
    return { ...base, headerRow: state.headerRow, firstDataRow: state.headerRow + 1 };
  }, [matrix, state.headerRow]);

  const mapping: ColumnMapping = useMemo(() => ({
    label: columnOf(state.fields, 'label'),
    amount: columnOf(state.fields, 'amount'),
    unit: columnOf(state.fields, 'unit'),
    code: columnOf(state.fields, 'code'),
  }), [state.fields]);

  const parsed = useMemo(
    () => parseCostRows(matrix, { firstDataRow: state.headerRow + 1 }, mapping, state.driver),
    [matrix, state.headerRow, mapping, state.driver],
  );

  const total = sumMoney(parsed.rows.map((r) => r.amount));

  return { matrix, analysis, mapping, parsed, total };
}
