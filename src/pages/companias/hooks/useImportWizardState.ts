import { useState } from 'react';
import type { SheetMatrix } from '../../../lib/tarifas/costSheetParser';
import type { CostDriver } from '../../../lib/tarifas/types';
import type { TargetField } from '../../../lib/tarifas/costSheetParser';

type Step = 'file' | 'sheet' | 'map' | 'preview';

export type ImportWizardState = ReturnType<typeof useImportWizardState>;

export function useImportWizardState() {
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<{ name: string; matrix: SheetMatrix }[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [fields, setFields] = useState<TargetField[]>([]);
  const [driver, setDriver] = useState<CostDriver>('FIXED');
  const [sign, setSign] = useState<'ADD' | 'SUBTRACT'>('ADD');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('file');
    setFileName('');
    setSheets([]);
    setSheetIndex(0);
    setError('');
  };

  return {
    step, setStep, fileName, setFileName, sheets, setSheets, sheetIndex, setSheetIndex,
    headerRow, setHeaderRow, fields, setFields, driver, setDriver, sign, setSign,
    mode, setMode, error, setError, busy, setBusy, reset,
  };
}
