// Importación de las filas de un tarifario desde CSV o Excel.

import Button from '../../../components/base/Button';
import { useModulePermissions } from '../../../hooks/use-module-permissions';
import { useImportRateTable } from './import-rate-table/useImportRateTable';
import ImportRateTableFileInput from './import-rate-table/ImportRateTableFileInput';
import ImportRateTableMapping from './import-rate-table/ImportRateTableMapping';
import ImportRateTableModeAndPreview from './import-rate-table/ImportRateTableModeAndPreview';
import type { RateTable } from '../../../lib/tarifas/types';

interface Props {
  isOpen: boolean;
  table: RateTable;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportRateTableModal({ isOpen, table, onClose, onImported }: Props) {
  const { canEdit } = useModulePermissions('tarifas.config');
  const state = useImportRateTable(table);

  const handleClose = () => {
    state.reset();
    onClose();
  };

  const handleImport = async () => {
    if (await state.handleImport()) onImported();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Importar filas de <span className="font-mono text-teal-700">{table.code}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              El archivo necesita una columna por cada variable de la clave, más el importe.
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {state.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {state.error}
            </div>
          )}

          {state.done ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 flex items-center justify-center bg-emerald-100 rounded-full mx-auto mb-4">
                <i className="ri-check-line text-2xl text-emerald-600"></i>
              </div>
              <h3 className="text-lg font-medium text-slate-800 mb-1">Importación terminada</h3>
              <p className="text-sm text-slate-600">
                {state.done.inserted} fila{state.done.inserted === 1 ? '' : 's'} agregada
                {state.done.inserted === 1 ? '' : 's'} · {state.done.replaced} actualizada
                {state.done.replaced === 1 ? '' : 's'}.
              </p>
            </div>
          ) : (
            <>
              <ImportRateTableFileInput
                fileName={state.fileName}
                numberFormat={state.numberFormat}
                sheetIndex={state.sheetIndex}
                headerRow={state.headerRow}
                sheets={state.sheets}
                matrix={state.sheets[state.sheetIndex]?.matrix ?? []}
                onFileChange={state.handleFile}
                onNumberFormatChange={state.setNumberFormat}
                onSheetChange={state.setSheetIndex}
                onHeaderRowChange={state.setHeaderRow}
              />

              {state.sheets.length > 0 && (
                <>
                  <ImportRateTableMapping
                    table={table}
                    columnOptions={state.columnOptions}
                    mapping={state.mapping}
                    notes={state.notes}
                    customLabels={state.customLabels}
                    onSetKeyColumn={state.setKeyColumn}
                    onSetAmountColumn={(val) => {
                      state.setMapping?.({ ...state.mapping, amount: val });
                    }}
                    onSetValueColumn={(name, val) => {
                      state.setMapping?.({ ...state.mapping, values: { ...state.mapping.values, [name]: val } });
                    }}
                  />

                  <ImportRateTableModeAndPreview
                    mode={state.mode}
                    confirmReplace={state.confirmReplace}
                    acknowledgeIssues={state.acknowledgeIssues}
                    hasIssues={state.hasIssues}
                    parsed={state.parsed}
                    duplicadas={state.duplicadas}
                    table={table}
                    customLabels={state.customLabels}
                    onSetMode={state.setMode}
                    onSetConfirmReplace={state.setConfirmReplace}
                    onSetAcknowledgeIssues={state.setAcknowledgeIssues}
                  />
                </>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={handleClose} disabled={state.busy}>
            {state.done ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!state.done && (
            <Button
              onClick={handleImport}
              disabled={!state.canImport || state.busy || !canEdit}
              title={!canEdit ? 'Tu rol no puede importar' : undefined}
            >
              <i className="ri-upload-2-line mr-1"></i>
              {state.busy ? 'Importando…' : `Importar ${state.parsed.rows.length} fila${state.parsed.rows.length === 1 ? '' : 's'}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
