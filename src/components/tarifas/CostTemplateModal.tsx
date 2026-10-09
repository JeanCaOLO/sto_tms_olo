// Subir la plantilla de estructura de costos: archivo -> vista previa (errores, avisos, resumen por
// tipo de camión) -> guardar. Guardar REEMPLAZA la estructura activa del ámbito (país o compañía).
// El mismo diálogo lo usan Reglas de Tarifa (flota propia del país) y la ficha de la compañía.

import Button from '../base/Button';
import { CostTemplatePreview } from './cost-template/CostTemplatePreview';
import { downloadCostTemplate } from './cost-template/costTemplateFile';
import { useCostTemplateUpload } from './cost-template/useCostTemplateUpload';

export { downloadCostTemplate };

interface Props {
  isOpen: boolean;
  /** Compañía dueña. Null = estructura por defecto de la flota propia del país. */
  partyId: string | null;
  countryId: string;
  /** Nombre con el que se guarda la estructura. */
  structureName: string;
  /** Texto que explica a qué estructura reemplaza ("la estructura de la flota propia de Costa Rica"). */
  scopeLabel: string;
  currency?: string;
  onClose: () => void;
  onApplied: () => void;
}

export default function CostTemplateModal({
  isOpen, partyId, countryId, structureName, scopeLabel, currency, onClose, onApplied,
}: Props) {
  const upload = useCostTemplateUpload({ isOpen, partyId, countryId, structureName, scopeLabel, onClose, onApplied });
  const { parsed, reading, saving } = upload;

  if (!isOpen) return null;

  const hasErrors = !!parsed && parsed.errors.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Subir plantilla de estructura de costos</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Al guardar se reemplaza {scopeLabel}. Si todavía no tenés el archivo, descargá la plantilla vacía.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {upload.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{upload.error}</div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
              <i className="ri-file-excel-2-line"></i> Elegir archivo .xlsx
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { void upload.handleFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
            <Button variant="secondary" onClick={downloadCostTemplate}>
              <i className="ri-download-2-line mr-1"></i> Descargar plantilla
            </Button>
            {upload.fileName && <span className="text-xs text-slate-500">{upload.fileName}</span>}
            {reading && <i className="ri-loader-4-line animate-spin text-slate-500"></i>}
          </div>

          {parsed && <CostTemplatePreview parsed={parsed} summary={upload.summary} currency={currency} />}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void upload.handleSave()} disabled={!parsed || hasErrors || saving || reading}>
            {saving ? 'Guardando...' : 'Guardar y reemplazar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
