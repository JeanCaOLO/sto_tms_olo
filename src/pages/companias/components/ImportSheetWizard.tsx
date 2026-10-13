// Importación de una planilla de estructura de costos.
//
// El flujo es de CUATRO pasos a propósito: archivo → hoja → mapeo → vista previa. Ninguna planilla
// viene igual, así que el sistema no adivina: propone y la persona confirma. La vista previa
// muestra también lo que NO se va a importar, para que nadie descubra después que faltaban filas.

import type { CostRowInput } from '../../../lib/tarifas/costStructureDataSource';
import { useImportWizardState } from '../hooks/useImportWizardState';
import { useSheetAnalysis } from '../hooks/useSheetAnalysis';
import { useWizardActions } from '../hooks/useWizardActions';
import { FileStep } from './import-wizard/FileStep';
import { MapStep } from './import-wizard/MapStep';
import { PreviewStep } from './import-wizard/PreviewStep';
import { SheetStep } from './import-wizard/SheetStep';
import { WizardHeader } from './import-wizard/WizardHeader';

interface Props {
  isOpen: boolean;
  structureName: string;
  onClose: () => void;
  onImport: (rows: CostRowInput[], mode: 'replace' | 'append') => Promise<void>;
}

export default function ImportSheetWizard({ isOpen, structureName, onClose, onImport }: Props) {
  const state = useImportWizardState();
  const { matrix, analysis, mapping, parsed, total } = useSheetAnalysis(state);
  const { handleClose, selectSheet, handleFile, handleImport } = useWizardActions({ state, parsed, onImport, onClose });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <WizardHeader structureName={structureName} step={state.step} onClose={handleClose} />

        <div className="px-6 py-5 space-y-4">
          {state.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{state.error}</div>
          )}

          {state.step === 'file' && <FileStep onFile={(file) => void handleFile(file)} />}
          {state.step === 'sheet' && <SheetStep state={state} onSelectSheet={(i) => selectSheet(state.sheets, i)} />}
          {state.step === 'map' && <MapStep state={state} analysis={analysis} matrix={matrix} mapping={mapping} />}
          {state.step === 'preview' && (
            <PreviewStep state={state} parsed={parsed} total={total} onImport={() => void handleImport()} />
          )}
        </div>
      </div>
    </div>
  );
}
