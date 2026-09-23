// Variables personalizadas de una compañía: los campos propios que usa para liquidar cuando el
// vocabulario que trae el sistema no le alcanza.
//
// Se administran desde la ficha de la compañía, no desde el editor de reglas, porque son un dato de
// la compañía: las reglas las CONSUMEN, no las definen.

import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import {
  deactivatePartyVariable, listPartyVariables, reactivatePartyVariable, savePartyVariable,
  type PartyVariableInput, type VariableErrors,
} from '../../../lib/tarifas/partyVariablesDataSource';
import type { CustomVarOrigin, PartyVariable } from '../../../lib/tarifas/types';
import type { SettlementPartyRow } from '../../../lib/tarifas/parties';

interface Props {
  isOpen: boolean;
  party: SettlementPartyRow | null;
  onClose: () => void;
}

const ORIGIN_OPTIONS: { value: CustomVarOrigin; label: string }[] = [
  { value: 'CONSTANT', label: 'Constante de la compañía (mismo valor en todos los viajes)' },
  { value: 'PER_TRIP', label: 'Se carga en cada liquidación' },
];

const KIND_OPTIONS = [
  { value: 'NUMBER', label: 'Número (sirve para multiplicar o contar)' },
  { value: 'TEXT', label: 'Texto (solo sirve para condicionar)' },
];

function emptyForm(partyId: string): PartyVariableInput {
  return {
    partyId,
    key: '',
    label: '',
    kind: 'NUMBER',
    origin: 'CONSTANT',
    defaultValue: '',
    unit: '',
    active: true,
  };
}

export default function VariablesModal({ isOpen, party, onClose }: Props) {
  const [variables, setVariables] = useState<PartyVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<PartyVariableInput>(emptyForm(''));
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<VariableErrors>({});
  const [generalError, setGeneralError] = useState('');

  const load = useCallback(async () => {
    if (!party) return;
    setLoading(true);
    try {
      setVariables(await listPartyVariables(party.id, { includeInactive: true }));
    } finally {
      setLoading(false);
    }
  }, [party]);

  useEffect(() => {
    if (!isOpen || !party) return;
    setForm(emptyForm(party.id));
    setEditingId(undefined);
    setErrors({});
    setGeneralError('');
    void load();
  }, [isOpen, party, load]);

  if (!isOpen || !party) return null;

  const set = <K extends keyof PartyVariableInput>(key: K, value: PartyVariableInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const startEdit = (variable: PartyVariable) => {
    setEditingId(variable.id);
    setErrors({});
    setGeneralError('');
    setForm({
      partyId: variable.partyId,
      key: variable.key.replace(/^custom:/, ''),
      label: variable.label,
      kind: variable.kind,
      origin: variable.origin,
      defaultValue: variable.defaultValue ?? '',
      unit: variable.unit ?? '',
      active: variable.active,
    });
  };

  const cancelEdit = () => {
    setEditingId(undefined);
    setForm(emptyForm(party.id));
    setErrors({});
  };

  const handleSave = async () => {
    setGeneralError('');
    const result = await savePartyVariable(form, editingId);

    if (result.status === 'invalid') {
      setErrors(result.errors);
      return;
    }
    if (result.status === 'failed') {
      setGeneralError(result.error.message);
      return;
    }
    cancelEdit();
    await load();
  };

  const toggleActive = async (variable: PartyVariable) => {
    const result = variable.active
      ? await deactivatePartyVariable(variable.id)
      : await reactivatePartyVariable(variable.id);
    if (result.error) {
      setGeneralError(result.error);
      return;
    }
    await load();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Variables de {party.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Campos propios de esta compañía, disponibles en sus reglas de liquidación.
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

          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg px-4 py-3">
            <i className="ri-information-line mt-0.5 shrink-0"></i>
            <span>
              La <strong>clave</strong> es el identificador que usan las reglas y no debería cambiar
              nunca; el <strong>nombre</strong> es lo que se ve en pantalla y se puede reescribir
              cuando quieras. Las variables se dan de baja, no se borran: si una regla todavía la usa,
              el editor de reglas la marca en rojo en vez de dejar un cálculo roto en silencio.
            </span>
          </div>

          {/* ── Alta / edición ────────────────────────────────────────────────────────────── */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar variable' : 'Nueva variable'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Clave *"
                value={form.key}
                onChange={(e) => set('key', e.target.value)}
                placeholder="horas_espera"
                error={errors.key}
                disabled={!!editingId}
              />
              <Input
                label="Nombre visible *"
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
                placeholder="Horas de espera"
                error={errors.label}
              />
              <Select
                label="Tipo *"
                value={form.kind}
                onChange={(e) => set('kind', e.target.value as 'NUMBER' | 'TEXT')}
                options={KIND_OPTIONS}
              />
              <Select
                label="¿De dónde sale el valor? *"
                value={form.origin}
                onChange={(e) => set('origin', e.target.value as CustomVarOrigin)}
                options={ORIGIN_OPTIONS}
              />
              <Input
                label={form.origin === 'CONSTANT' ? 'Valor *' : 'Valor por defecto'}
                value={form.defaultValue ?? ''}
                onChange={(e) => set('defaultValue', e.target.value)}
                placeholder={form.kind === 'NUMBER' ? '15' : 'texto'}
                error={errors.defaultValue}
              />
              <Input
                label="Unidad"
                value={form.unit ?? ''}
                onChange={(e) => set('unit', e.target.value)}
                placeholder="horas"
              />
            </div>

            <div className="flex justify-end gap-2">
              {editingId && (
                <Button type="button" variant="secondary" onClick={cancelEdit}>Cancelar</Button>
              )}
              <Button type="button" onClick={handleSave}>
                <i className="ri-save-line mr-1"></i>
                {editingId ? 'Guardar cambios' : 'Agregar variable'}
              </Button>
            </div>
          </div>

          {/* ── Listado ───────────────────────────────────────────────────────────────────── */}
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Cargando…</p>
          ) : variables.length === 0 ? (
            <div className="text-center py-8">
              <i className="ri-code-box-line text-3xl text-slate-300"></i>
              <p className="mt-2 text-sm text-slate-600 font-medium">Esta compañía no tiene variables propias</p>
              <p className="text-xs text-slate-500">
                Agregá una solo si esta compañía calcula con algo que el sistema no trae de fábrica.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase">
                    <th className="px-3 py-2">Clave</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Origen</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {variables.map((variable) => (
                    <tr key={variable.id} className={variable.active ? '' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{variable.key}</td>
                      <td className="px-3 py-2 text-slate-800">{variable.label}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {variable.kind === 'NUMBER' ? 'Número' : 'Texto'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {variable.origin === 'CONSTANT' ? 'Constante' : 'Por viaje'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {variable.defaultValue ?? '—'}
                        {variable.unit ? <span className="text-xs text-slate-400"> {variable.unit}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={variable.active ? 'success' : 'default'} size="sm">
                          {variable.active ? 'Activa' : 'De baja'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(variable)} title="Editar">
                            <i className="ri-edit-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void toggleActive(variable)}
                            title={variable.active ? 'Dar de baja' : 'Reactivar'}
                          >
                            <i className={variable.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
