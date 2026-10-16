// Hook para manejar la lógica de importación de filas de tarifario desde archivos.

import { useState } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import type { NumberFormat } from '../../../../lib/tarifas/costSheetParser';
import type { RateTableMapping } from '../../../../lib/tarifas/rateTableImport';
import type { RateTable } from '../../../../lib/tarifas/types';
import { INITIAL_IMPORT_STATE, type ImportState } from './importRateTableState';
import { useImportCustomLabels } from './useImportCustomLabels';
import { useImportParsing } from './useImportParsing';
import { useImportFile } from './useImportFile';
import { useImportRun } from './useImportRun';

export function useImportRateTable(table: RateTable | null) {
  const { appUser } = useAuth();
  const usuarioActivo = appUser?.full_name || appUser?.email || 'Usuario';

  const [state, setState] = useState<ImportState>(INITIAL_IMPORT_STATE);

  useImportCustomLabels(table, setState);
  const parsing = useImportParsing(table, state);
  const file = useImportFile(table, state, setState);
  const run = useImportRun(table, state, setState, parsing.parsed, usuarioActivo);

  const setKeyColumn = (index: number, value: string) => {
    setState((s) => {
      const copia = [...s.mapping.key];
      copia[index] = value === '' ? null : Number(value);
      return { ...s, mapping: { ...s.mapping, key: copia } };
    });
  };

  return {
    ...state,
    ...parsing,
    ...file,
    ...run,
    setKeyColumn,
    setMapping: (mapping: RateTableMapping) => setState((s) => ({ ...s, mapping })),
    setNumberFormat: (fmt: NumberFormat) => setState((s) => ({ ...s, numberFormat: fmt })),
    setMode: (mode: 'replace' | 'merge') => setState((s) => ({ ...s, mode, confirmReplace: false })),
    setConfirmReplace: (val: boolean) => setState((s) => ({ ...s, confirmReplace: val })),
    setAcknowledgeIssues: (val: boolean) => setState((s) => ({ ...s, acknowledgeIssues: val })),
    setHeaderRow: (row: number) => setState((s) => ({ ...s, headerRow: row })),
  };
}
