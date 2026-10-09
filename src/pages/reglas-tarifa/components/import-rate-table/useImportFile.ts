import { readSheets } from '../../../../lib/tarifas/sheetReader';
import { analyzeRateTableSheet } from '../../../../lib/tarifas/rateTableImport';
import type { RateTable } from '../../../../lib/tarifas/types';
import type { ImportState, SetImportState } from './importRateTableState';

/** Leer el archivo, cambiar de hoja y volver al estado inicial; cada hoja se vuelve a analizar. */
export function useImportFile(table: RateTable | null, state: ImportState, setState: SetImportState) {
  const analyze = (matrix: Parameters<typeof analyzeRateTableSheet>[0]) => analyzeRateTableSheet(
    matrix, table?.keyColumns ?? [], state.customLabels, table?.valueColumns ?? [],
  );

  const reset = () => {
    setState((s) => ({
      ...s,
      fileName: '',
      sheets: [],
      sheetIndex: 0,
      headerRow: 0,
      mapping: { key: [], amount: null },
      notes: [],
      error: '',
      done: null,
      confirmReplace: false,
      acknowledgeIssues: false,
    }));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setState((s) => ({ ...s, error: '', done: null }));
    try {
      const loaded = await readSheets(file);
      if (loaded.length === 0) throw new Error('El archivo no tiene contenido.');
      const analysis = analyze(loaded[0]?.matrix ?? []);
      setState((s) => ({
        ...s,
        fileName: file.name,
        sheets: loaded,
        sheetIndex: 0,
        headerRow: analysis.headerRow,
        mapping: analysis.mapping,
        notes: analysis.notes,
      }));
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'No se pudo leer el archivo.' }));
    }
  };

  const setSheetIndex = (idx: number) => {
    const analysis = analyze(state.sheets[idx]?.matrix ?? []);
    setState((s) => ({
      ...s,
      sheetIndex: idx,
      headerRow: analysis.headerRow,
      mapping: analysis.mapping,
      notes: analysis.notes,
    }));
  };

  return { reset, handleFile, setSheetIndex };
}
