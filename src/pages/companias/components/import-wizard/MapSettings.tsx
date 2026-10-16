import Select from '../../../../components/base/Select';
import type { SheetMatrix } from '../../../../lib/tarifas/costSheetParser';
import type { CostDriver } from '../../../../lib/tarifas/types';
import type { ImportWizardState } from '../../hooks/useImportWizardState';
import { DRIVER_OPTIONS } from './importWizardOptions';

const HEADER_ROWS_SHOWN = 15;

const SIGN_OPTIONS = [
  { value: 'ADD', label: 'Suma al costo' },
  { value: 'SUBTRACT', label: 'Resta del costo' },
];

/** Fila del encabezado, forma de cobro y efecto sobre el costo. */
export function MapSettings({ state, matrix }: { state: ImportWizardState; matrix: SheetMatrix }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Select
        label="Fila del encabezado"
        value={String(state.headerRow)}
        onChange={(e) => state.setHeaderRow(Number(e.target.value))}
        options={matrix.slice(0, HEADER_ROWS_SHOWN).map((row, i) => ({
          value: String(i),
          label: `Fila ${i + 1}: ${row.filter(Boolean).slice(0, 3).join(' | ').slice(0, 40) || '(vacía)'}`,
        }))}
      />
      <Select
        label="¿Cómo se cobra cada fila?"
        value={state.driver}
        onChange={(e) => state.setDriver(e.target.value as CostDriver)}
        options={DRIVER_OPTIONS}
      />
      <Select
        label="Efecto"
        value={state.sign}
        onChange={(e) => state.setSign(e.target.value as 'ADD' | 'SUBTRACT')}
        options={SIGN_OPTIONS}
      />
    </div>
  );
}
