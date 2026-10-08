import type { Dispatch, SetStateAction } from 'react';
import type { LoadedSheet } from '../../../../lib/tarifas/sheetReader';
import type { RateTableMapping } from '../../../../lib/tarifas/rateTableImport';
import type { NumberFormat } from '../../../../lib/tarifas/costSheetParser';

export interface ImportState {
  fileName: string;
  sheets: LoadedSheet[];
  sheetIndex: number;
  headerRow: number;
  mapping: RateTableMapping;
  notes: string[];
  numberFormat: NumberFormat;
  mode: 'replace' | 'merge';
  error: string;
  busy: boolean;
  done: { inserted: number; replaced: number } | null;
  confirmReplace: boolean;
  acknowledgeIssues: boolean;
  customLabels: Record<string, string>;
}

export type SetImportState = Dispatch<SetStateAction<ImportState>>;

export const INITIAL_IMPORT_STATE: ImportState = {
  fileName: '',
  sheets: [],
  sheetIndex: 0,
  headerRow: 0,
  mapping: { key: [], amount: null },
  notes: [],
  numberFormat: 'auto',
  mode: 'merge',
  error: '',
  busy: false,
  done: null,
  confirmReplace: false,
  acknowledgeIssues: false,
  customLabels: {},
};
