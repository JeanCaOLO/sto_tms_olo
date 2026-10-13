import type Decimal from 'decimal.js';
import Button from '../../../../components/base/Button';
import type { ParseResult } from '../../../../lib/tarifas/costSheetParser';
import type { ImportWizardState } from '../../hooks/useImportWizardState';
import { PreviewRowsTable } from './PreviewRowsTable';
import { PreviewSummary } from './PreviewSummary';
import { SkippedRowsList } from './SkippedRowsList';

interface Props {
  state: ImportWizardState;
  parsed: ParseResult;
  total: Decimal;
  onImport: () => void;
}

/** Paso 4: vista previa de lo que se importa y el botón para confirmar. */
export function PreviewStep({ state, parsed, total, onImport }: Props) {
  return (
    <div className="space-y-4">
      <PreviewSummary state={state} parsed={parsed} total={total} />
      <PreviewRowsTable rows={parsed.rows} />
      <SkippedRowsList skipped={parsed.skipped} />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => state.setStep('map')} disabled={state.busy}>Atrás</Button>
        <Button onClick={onImport} disabled={state.busy || parsed.rows.length === 0}>
          {state.busy ? 'Importando…' : `Importar ${parsed.rows.length} filas`}
        </Button>
      </div>
    </div>
  );
}
