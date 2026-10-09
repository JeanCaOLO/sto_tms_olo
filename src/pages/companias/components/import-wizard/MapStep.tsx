import Button from '../../../../components/base/Button';
import type { ColumnMapping, SheetAnalysis, SheetMatrix } from '../../../../lib/tarifas/costSheetParser';
import type { ImportWizardState } from '../../hooks/useImportWizardState';
import { MapColumnsTable } from './MapColumnsTable';
import { MapSettings } from './MapSettings';

interface Props {
  state: ImportWizardState;
  analysis: SheetAnalysis;
  matrix: SheetMatrix;
  mapping: ColumnMapping;
}

/** Paso 3: indicar qué columna es el concepto, el importe, etc. */
export function MapStep({ state, analysis, matrix, mapping }: Props) {
  const incomplete = mapping.label === null || mapping.amount === null;
  return (
    <div className="space-y-4">
      {analysis.notes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-3 space-y-1">
          {analysis.notes.map((n, i) => <p key={i}>{n}</p>)}
        </div>
      )}

      <MapSettings state={state} matrix={matrix} />
      <MapColumnsTable state={state} analysis={analysis} matrix={matrix} />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => state.setStep('sheet')}>Atrás</Button>
        <Button
          onClick={() => state.setStep('preview')}
          disabled={incomplete}
          title={incomplete ? 'Marcá al menos una columna como Concepto y otra como Importe' : undefined}
        >
          Ver qué se va a importar
        </Button>
      </div>
    </div>
  );
}
