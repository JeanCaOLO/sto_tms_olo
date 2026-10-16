interface Props {
  mode: 'replace' | 'merge';
  confirmReplace: boolean;
  onSetMode: (mode: 'replace' | 'merge') => void;
  onSetConfirmReplace: (val: boolean) => void;
}

/** Qué hacer con las filas que ya tiene el tarifario: actualizar o reemplazar todo (con confirmación). */
export default function ImportModePicker({ mode, confirmReplace, onSetMode, onSetConfirmReplace }: Props) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">
        Qué hacer con las filas que ya tiene el tarifario
      </h3>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="radio"
            checked={mode === 'merge'}
            onChange={() => onSetMode('merge')}
            className="mt-1 text-teal-600 focus:ring-teal-500"
          />
          <span>
            <strong>Actualizar</strong> — se conservan las que están y se pisa el
            importe de las que coincidan en clave.
            <span className="block text-xs text-slate-500">
              Es lo que se quiere al recibir una lista de correcciones.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="radio"
            checked={mode === 'replace'}
            onChange={() => { onSetMode('replace'); onSetConfirmReplace(false); }}
            className="mt-1 text-teal-600 focus:ring-teal-500"
          />
          <span>
            <strong>Reemplazar todo</strong> — se borran todas las filas actuales y
            queda solo lo del archivo.
            <span className="block text-xs text-slate-500">
              Es lo que se quiere al recibir el tarifario nuevo completo.
            </span>
          </span>
        </label>
        {mode === 'replace' && (
          <label className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmReplace}
              onChange={(e) => onSetConfirmReplace(e.target.checked)}
              className="mt-1 text-teal-600 focus:ring-teal-500"
            />
            <span>
              <strong>Confirmo que quiero borrar TODAS las filas actuales</strong> — esto no se puede deshacer.
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
