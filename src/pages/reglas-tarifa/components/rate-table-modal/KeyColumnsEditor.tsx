import Select from '../../../../components/base/Select';
import type { VarKey } from '../../../../lib/tarifas/types';

interface Props {
  keyColumns: string[];
  valueColumns: string[];
  hasParty: boolean;
  error?: string;
  disponibles: string[];
  varLabelOf: (key: VarKey) => string;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onAdd: (key: string) => void;
}

const ICON_BTN = 'w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed';

function KeyHelp({ hasParty }: { hasParty: boolean }) {
  return (
    <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg px-3 py-2.5">
      <i className="ri-information-line mt-0.5 shrink-0"></i>
      <span>
        Las variables <strong>categóricas</strong> (zona, tipo de camión…) casan con un valor
        exacto. Las <strong>numéricas</strong> (kilómetros, peso, paradas, horas) casan por{' '}
        <strong>rango</strong>: en la fila se escribe el tramo, por ejemplo{' '}
        <code className="font-mono">0..100</code>, <code className="font-mono">101..300</code> o{' '}
        <code className="font-mono">301..</code> (extremos incluidos), y 181 km cae en
        «101..300». Una celda vacía vale para todo.{' '}
        {hasParty
          ? 'También puede usar las variables personalizadas de su compañía: las numéricas por rango, las de texto por valor exacto.'
          : 'Las variables personalizadas solo se pueden usar en el tarifario de una compañía con perfil de cálculo.'}
      </span>
    </div>
  );
}

/** Variables que forman la clave del tarifario, en orden, con la fila de ejemplo y las que se pueden agregar. */
export function KeyColumnsEditor({
  keyColumns, valueColumns, hasParty, error, disponibles, varLabelOf, onMove, onRemove, onAdd,
}: Props) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Clave del tarifario</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Qué mira el motor para elegir la fila. El orden es el orden de las columnas al
          cargar las filas.
        </p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {keyColumns.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">Todavía no elegiste ninguna variable.</p>
      ) : (
        <ol className="space-y-1.5">
          {keyColumns.map((key, index) => (
            <li key={key} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <span className="w-5 h-5 shrink-0 flex items-center justify-center bg-teal-100 text-teal-700 rounded text-xs font-medium">
                {index + 1}
              </span>
              <span className="flex-1 text-sm text-slate-800">{varLabelOf(key as VarKey)}</span>
              <code className="text-[11px] text-slate-400 font-mono">{key}</code>
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} className={ICON_BTN} title="Subir">
                <i className="ri-arrow-up-line"></i>
              </button>
              <button
                type="button" onClick={() => onMove(index, 1)} disabled={index === keyColumns.length - 1}
                className={ICON_BTN} title="Bajar"
              >
                <i className="ri-arrow-down-line"></i>
              </button>
              <button
                type="button" onClick={() => onRemove(index)}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                title="Quitar"
              >
                <i className="ri-close-line"></i>
              </button>
            </li>
          ))}
        </ol>
      )}
      {disponibles.length > 0 && (
        <Select
          label="Agregar variable a la clave"
          value=""
          onChange={(e) => onAdd(e.target.value)}
          options={[
            { value: '', label: 'Elegir…' },
            ...disponibles.map((v) => ({ value: v, label: varLabelOf(v as VarKey) })),
          ]}
        />
      )}
      {/* Ver la fila mientras se arma la clave es lo que evita cargar 60 filas mal. */}
      {keyColumns.length > 0 && (
        <div className="bg-slate-800 rounded-lg px-3 py-2.5 overflow-x-auto">
          <p className="text-[11px] text-slate-400 mb-1">Así se va a ver una fila:</p>
          <code className="text-xs text-teal-300 font-mono whitespace-nowrap">
            {keyColumns.map((k) => varLabelOf(k as VarKey)).join('  |  ')}  |  Importe
            {valueColumns.map((c) => `  |  ${c}`).join('')}
          </code>
        </div>
      )}
      <KeyHelp hasParty={hasParty} />
    </div>
  );
}
