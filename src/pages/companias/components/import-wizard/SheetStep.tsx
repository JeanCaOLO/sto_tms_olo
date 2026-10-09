import Button from '../../../../components/base/Button';
import { analyzeSheet } from '../../../../lib/tarifas/costSheetParser';
import type { ImportWizardState } from '../../hooks/useImportWizardState';

interface Props {
  state: ImportWizardState;
  onSelectSheet: (index: number) => void;
}

/** Paso 2: elegir cuál de las hojas del archivo se importa. */
export function SheetStep({ state, onSelectSheet }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        <strong>{state.fileName}</strong> — {state.sheets.length} hoja(s).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {state.sheets.map((s, i) => {
          const a = analyzeSheet(s.matrix);
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => onSelectSheet(i)}
              className={`text-left px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
                state.sheetIndex === i ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-sm font-medium text-slate-800">{s.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {s.matrix.length} filas · {a.columns.length} columnas
                {a.detectedCurrency ? ` · ${a.detectedCurrency}` : ''}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => state.setStep('file')}>Atrás</Button>
        <Button onClick={() => state.setStep('map')}>Continuar</Button>
      </div>
    </div>
  );
}
