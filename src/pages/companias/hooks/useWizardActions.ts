import { analyzeSheet, type ParseResult, type SheetMatrix } from '../../../lib/tarifas/costSheetParser';
import type { CostRowInput } from '../../../lib/tarifas/costStructureDataSource';
import type { ImportWizardState } from './useImportWizardState';

interface Params {
  state: ImportWizardState;
  parsed: ParseResult;
  onImport: (rows: CostRowInput[], mode: 'replace' | 'append') => Promise<void>;
  onClose: () => void;
}

/** Lee todas las hojas de un Excel o CSV como matrices de celdas. */
async function readWorkbook(file: File): Promise<{ name: string; matrix: SheetMatrix }[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.map((name) => ({
    name,
    matrix: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1, blankrows: false, defval: null,
    }) as unknown as SheetMatrix,
  }));
}

/** Acciones del asistente: cerrar, leer el archivo, elegir la hoja e importar. */
export function useWizardActions({ state, parsed, onImport, onClose }: Params) {
  const handleClose = () => { state.reset(); onClose(); };

  const selectSheet = (all: ImportWizardState['sheets'], index: number) => {
    const analysis = analyzeSheet(all[index]?.matrix ?? []);
    state.setSheetIndex(index);
    state.setHeaderRow(analysis.headerRow === -1 ? 0 : analysis.headerRow);
    state.setFields(analysis.columns.map((c) => c.suggested));
    state.setDriver(analysis.suggestedDriver);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    state.setError('');
    try {
      const sheets = await readWorkbook(file);
      if (sheets.length === 0) throw new Error('El archivo no tiene hojas.');
      state.setFileName(file.name);
      state.setSheets(sheets);
      selectSheet(sheets, 0);
      state.setStep('sheet');
    } catch (e) {
      state.setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  };

  const handleImport = async () => {
    state.setBusy(true);
    state.setError('');
    try {
      await onImport(
        parsed.rows.map((r) => ({
          code: r.code, label: r.label, driver: r.driver, amount: r.amount, sign: state.sign,
          appliesWhen: null, unit: r.unit, active: true,
        })),
        state.mode,
      );
      handleClose();
    } catch (e) {
      state.setError(e instanceof Error ? e.message : 'No se pudo importar.');
    } finally {
      state.setBusy(false);
    }
  };

  return { handleClose, selectSheet, handleFile, handleImport };
}
