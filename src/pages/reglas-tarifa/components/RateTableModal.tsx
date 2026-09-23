// Alta y edición de un tarifario: su código, su alcance y —lo importante— QUÉ variables forman su
// clave.
//
// La clave es la decisión que define la tabla entera: cada fila lleva un valor por cada variable
// elegida, en ese orden. Por eso el formulario muestra un ejemplo de fila en vivo mientras se
// arman las columnas: elegir la clave sin ver cómo queda la fila es la parte donde la gente se
// equivoca y después carga sesenta filas mal.

import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { VAR_KEY_LABELS } from '../../../lib/tarifas/format';
import {
  RATE_TABLE_KEY_VARS, saveRateTable,
  type RateTableErrors, type RateTableInput,
} from '../../../lib/tarifas/rateTablesDataSource';
import type { RateTable, VarKey } from '../../../lib/tarifas/types';
import type { SettlementPartyRow } from '../../../lib/tarifas/parties';

interface Props {
  isOpen: boolean;
  countryId: string;
  /** Tarifario a editar. Null = alta. */
  table: RateTable | null;
  parties: SettlementPartyRow[];
  /** Moneda del país, para la ayuda en pantalla. */
  currency?: string;
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm = (countryId: string): RateTableInput => ({
  countryId,
  partyId: null,
  code: '',
  name: '',
  keyColumns: ['originZone', 'truckTypeId'],
  active: true,
});

const varLabelOf = (key: VarKey) => VAR_KEY_LABELS[key as keyof typeof VAR_KEY_LABELS] ?? key;

export default function RateTableModal({
  isOpen, countryId, table, parties, currency, onClose, onSaved,
}: Props) {
  const [form, setForm] = useState<RateTableInput>(emptyForm(countryId));
  const [errors, setErrors] = useState<RateTableErrors>({});
  const [generalError, setGeneralError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setGeneralError('');
    setForm(table
      ? {
        countryId: table.countryId,
        partyId: table.partyId,
        code: table.code,
        name: table.name,
        keyColumns: [...table.keyColumns],
        active: table.active,
      }
      : emptyForm(countryId));
  }, [isOpen, table, countryId]);

  const disponibles = useMemo(
    () => RATE_TABLE_KEY_VARS.filter((v) => !form.keyColumns.includes(v)),
    [form.keyColumns],
  );

  // La clave cambió respecto de lo guardado: las filas existentes se van a reacomodar.
  const claveCambiada = !!table
    && (table.keyColumns.length !== form.keyColumns.length
      || table.keyColumns.some((c, i) => c !== form.keyColumns[i]));

  if (!isOpen) return null;

  const set = <K extends keyof RateTableInput>(key: K, value: RateTableInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const agregarColumna = (key: VarKey) => {
    if (!key || form.keyColumns.includes(key)) return;
    set('keyColumns', [...form.keyColumns, key]);
  };

  const quitarColumna = (index: number) => {
    set('keyColumns', form.keyColumns.filter((_, i) => i !== index));
  };

  const moverColumna = (index: number, delta: number) => {
    const destino = index + delta;
    if (destino < 0 || destino >= form.keyColumns.length) return;
    const copia = [...form.keyColumns];
    [copia[index], copia[destino]] = [copia[destino]!, copia[index]!];
    set('keyColumns', copia);
  };

  const handleSave = async () => {
    setGeneralError('');
    setSaving(true);
    try {
      const result = await saveRateTable(form, table?.id);
      if (result.status === 'invalid') { setErrors(result.errors); return; }
      if (result.status === 'failed') { setGeneralError(result.error.message); return; }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {table ? `Editar ${table.code}` : 'Nuevo tarifario'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Una fila por combinación, en vez de una regla por combinación.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {generalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {generalError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Código *"
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="TARIFARIO_ZONAS"
              error={errors.code}
            />
            <Input
              label="Nombre *"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Tarifario por zona y camión"
              error={errors.name}
            />
          </div>
          <p className="text-xs text-slate-500 -mt-3">
            El <strong>código</strong> es con el que una regla nombra este tarifario. Sin espacios ni
            acentos.
          </p>

          <Select
            label="Alcance"
            value={form.partyId ?? ''}
            onChange={(e) => set('partyId', e.target.value || null)}
            options={[
              { value: '', label: 'Todo el país' },
              ...parties.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <p className="text-xs text-slate-500 -mt-3">
            Un tarifario de compañía con el <strong>mismo código</strong> que uno del país lo
            reemplaza para esa compañía — igual que con las reglas.
          </p>

          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg px-3 py-2.5 -mt-1">
            <i className="ri-money-dollar-circle-line mt-0.5 shrink-0"></i>
            <span>
              Los importes van en <strong>{currency ?? 'la moneda del país'}</strong>, que es la
              única moneda del país. No hay conversión: lo que se carga acá es lo que se paga.
            </span>
          </div>

          {/* ── La clave ───────────────────────────────────────────────────────────────────── */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Clave del tarifario</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Qué mira el motor para elegir la fila. El orden es el orden de las columnas al
                cargar las filas.
              </p>
            </div>

            {errors.keyColumns && (
              <p className="text-xs text-red-600">{errors.keyColumns}</p>
            )}

            {form.keyColumns.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">Todavía no elegiste ninguna variable.</p>
            ) : (
              <ol className="space-y-1.5">
                {form.keyColumns.map((key, index) => (
                  <li key={key} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center bg-teal-100 text-teal-700 rounded text-xs font-medium">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm text-slate-800">{varLabelOf(key)}</span>
                    <code className="text-[11px] text-slate-400 font-mono">{key}</code>
                    <button
                      type="button"
                      onClick={() => moverColumna(index, -1)}
                      disabled={index === 0}
                      className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                      title="Subir"
                    >
                      <i className="ri-arrow-up-line"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => moverColumna(index, 1)}
                      disabled={index === form.keyColumns.length - 1}
                      className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                      title="Bajar"
                    >
                      <i className="ri-arrow-down-line"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => quitarColumna(index)}
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
                onChange={(e) => agregarColumna(e.target.value as VarKey)}
                options={[
                  { value: '', label: 'Elegir…' },
                  ...disponibles.map((v) => ({ value: v, label: varLabelOf(v) })),
                ]}
              />
            )}

            {/* Ver la fila mientras se arma la clave es lo que evita cargar 60 filas mal. */}
            {form.keyColumns.length > 0 && (
              <div className="bg-slate-800 rounded-lg px-3 py-2.5 overflow-x-auto">
                <p className="text-[11px] text-slate-400 mb-1">Así se va a ver una fila:</p>
                <code className="text-xs text-teal-300 font-mono whitespace-nowrap">
                  {form.keyColumns.map(varLabelOf).join('  |  ')}  |  Importe
                </code>
              </div>
            )}

            <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg px-3 py-2.5">
              <i className="ri-information-line mt-0.5 shrink-0"></i>
              <span>
                Sólo aparecen variables <strong>categóricas</strong>. Las numéricas (kilómetros,
                bultos) casarían por igualdad exacta —181 no casa con 180— y el tarifario quedaría
                mudo casi siempre: para cobrar por tramos de una magnitud está el operador{' '}
                <em>Por escalones</em>.
              </span>
            </div>
          </div>

          {claveCambiada && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-3">
              <i className="ri-alert-line mr-1"></i>
              Cambiaste la clave de un tarifario que ya tiene filas. Las filas se reacomodan solas:
              cada variable conserva su valor y las columnas nuevas quedan en comodín
              (<code className="font-mono">*</code>). Lo que pierda su columna se pierde.
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Tarifario activo
          </label>
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <i className="ri-save-line mr-1"></i>
            {saving ? 'Guardando…' : table ? 'Guardar cambios' : 'Crear tarifario'}
          </Button>
        </div>
      </div>
    </div>
  );
}
