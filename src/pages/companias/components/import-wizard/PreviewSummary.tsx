import type Decimal from 'decimal.js';
import Select from '../../../../components/base/Select';
import type { ParseResult } from '../../../../lib/tarifas/costSheetParser';
import type { ImportWizardState } from '../../hooks/useImportWizardState';

const MODE_OPTIONS = [
  { value: 'replace', label: 'Reemplazarlas por estas' },
  { value: 'append', label: 'Conservarlas y agregar estas al final' },
];

interface Props {
  state: ImportWizardState;
  parsed: ParseResult;
  total: Decimal;
}

/** Cuántas filas entran, cuántas se descartan, la suma de importes y qué hacer con las existentes. */
export function PreviewSummary({ state, parsed, total }: Props) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-emerald-700">
          <i className="ri-check-line mr-1"></i>
          <strong>{parsed.rows.length}</strong> filas se importan
        </span>
        {parsed.skipped.length > 0 && (
          <span className="text-amber-700">
            <i className="ri-error-warning-line mr-1"></i>
            <strong>{parsed.skipped.length}</strong> se descartan
          </span>
        )}
        <span className="text-slate-600 ml-auto">
          Suma de importes: <strong>{Number(total.toFixed(2)).toLocaleString('es-CR', { minimumFractionDigits: 2 })}</strong>
        </span>
      </div>

      <p className="text-xs text-slate-500">
        Compará esa suma con el total de la planilla: si no coinciden, revisá el mapeo antes
        de importar.
      </p>

      <Select
        label="¿Qué hacer con las filas que ya tiene la estructura?"
        value={state.mode}
        onChange={(e) => state.setMode(e.target.value as 'replace' | 'append')}
        options={MODE_OPTIONS}
      />
    </>
  );
}
