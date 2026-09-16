// Catálogo de vehículos de una compañía.
//
// Existe para que las reglas por capacidad dejen de depender de que alguien teclee los metros
// cúbicos en cada liquidación. El código de cada vehículo es el MISMO que usa su tarifa, así que
// después de importar un tarifario desde Excel los códigos ya están: solo falta decir cuánto mide
// y cuánto carga cada uno — y eso es justo lo que propone el atajo de arriba.

import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Badge from '../../../components/base/Badge';
import {
  deleteVehicleType, faltantesDeCatalogo, listVehicleTypes, saveVehicleType, setVehicleTypeActive,
  type VehicleTypeErrors, type VehicleTypeInput,
} from '../../../lib/tarifas/partyVehicleTypesDataSource';
import type { PartyVehicleType } from '../../../lib/tarifas/types';
import type { SettlementPartyRow } from '../../../lib/tarifas/parties';

interface Props {
  isOpen: boolean;
  party: SettlementPartyRow | null;
  onClose: () => void;
}

const emptyForm = (partyId: string): VehicleTypeInput => ({
  partyId,
  code: '',
  name: '',
  volumeM3: '0',
  weightTons: '0',
  notes: null,
  active: true,
});

export default function VehicleTypesModal({ isOpen, party, onClose }: Props) {
  const [types, setTypes] = useState<PartyVehicleType[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<VehicleTypeInput>(emptyForm(''));
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<VehicleTypeErrors>({});
  const [generalError, setGeneralError] = useState('');

  const load = useCallback(async () => {
    if (!party) return;
    setLoading(true);
    try {
      const [rows, faltantes] = await Promise.all([
        listVehicleTypes(party.id, { includeInactive: true }),
        faltantesDeCatalogo(party.id),
      ]);
      setTypes(rows);
      setMissing(faltantes);
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

  const set = <K extends keyof VehicleTypeInput>(key: K, value: VehicleTypeInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const cancelEdit = () => {
    setEditingId(undefined);
    setForm(emptyForm(party.id));
    setErrors({});
  };

  const startEdit = (type: PartyVehicleType) => {
    setEditingId(type.id);
    setErrors({});
    setGeneralError('');
    setForm({
      partyId: type.partyId,
      code: type.code,
      name: type.name,
      volumeM3: String(type.volumeM3),
      weightTons: String(type.weightTons),
      notes: type.notes,
      active: type.active,
    });
  };

  const handleSave = async () => {
    setGeneralError('');
    const result = await saveVehicleType(form, editingId);

    if (result.status === 'invalid') { setErrors(result.errors); return; }
    if (result.status === 'failed') { setGeneralError(result.error.message); return; }
    cancelEdit();
    await load();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Vehículos de {party.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              La capacidad de cada camión, para que las reglas por volumen o tonelaje no dependan de
              cargarla a mano en cada liquidación.
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

          {/* Atajo: los códigos ya existen en las tarifas importadas. */}
          {missing.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-800 font-medium">
                <i className="ri-lightbulb-line mr-1"></i>
                {missing.length} vehículo{missing.length === 1 ? '' : 's'} con tarifa pero sin capacidad
              </p>
              <p className="text-xs text-amber-700 mt-0.5 mb-2">
                Ya aparecen en las tarifas de esta compañía. Tocá uno para cargar su capacidad.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      cancelEdit();
                      setForm({ ...emptyForm(party.id), code, name: code });
                    }}
                    className="px-2.5 py-1 text-xs font-mono bg-white border border-amber-300 rounded-full hover:bg-amber-100 cursor-pointer"
                  >
                    {code} <i className="ri-add-line"></i>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg px-4 py-3">
            <i className="ri-information-line mt-0.5 shrink-0"></i>
            <span>
              El <strong>código</strong> tiene que coincidir con el que usan las tarifas y las
              liquidaciones — es la clave con la que el motor encuentra la capacidad. El{' '}
              <strong>nombre</strong> es solo para leerlo.
            </span>
          </div>

          {/* ── Alta / edición ────────────────────────────────────────────────────────────── */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar vehículo' : 'Nuevo vehículo'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                label="Código *"
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                placeholder="NPR"
                error={errors.code}
                disabled={!!editingId}
              />
              <Input
                label="Nombre *"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Isuzu NPR 3.5 t"
                error={errors.name}
              />
              <Input
                label="Volumen (m³) *"
                type="number"
                value={form.volumeM3}
                onChange={(e) => set('volumeM3', e.target.value)}
                error={errors.volumeM3}
              />
              <Input
                label="Capacidad (toneladas) *"
                type="number"
                value={form.weightTons}
                onChange={(e) => set('weightTons', e.target.value)}
                error={errors.weightTons}
              />
            </div>
            <div className="flex justify-end gap-2">
              {editingId && (
                <Button type="button" variant="secondary" onClick={cancelEdit}>Cancelar</Button>
              )}
              <Button type="button" onClick={() => void handleSave()}>
                <i className="ri-save-line mr-1"></i>
                {editingId ? 'Guardar cambios' : 'Agregar vehículo'}
              </Button>
            </div>
          </div>

          {/* ── Listado ───────────────────────────────────────────────────────────────────── */}
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Cargando…</p>
          ) : types.length === 0 ? (
            <div className="text-center py-8">
              <i className="ri-truck-line text-3xl text-slate-300"></i>
              <p className="mt-2 text-sm text-slate-600 font-medium">Esta compañía no tiene vehículos cargados</p>
              <p className="text-xs text-slate-500">
                Mientras falten, las reglas por metros cúbicos o toneladas no se aplican.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2 text-right">Volumen</th>
                    <th className="px-3 py-2 text-right">Capacidad</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {types.map((type) => (
                    <tr key={type.id} className={type.active ? '' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{type.code}</td>
                      <td className="px-3 py-2 text-slate-800">{type.name}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{type.volumeM3} m³</td>
                      <td className="px-3 py-2 text-right text-slate-700">{type.weightTons} t</td>
                      <td className="px-3 py-2">
                        <Badge variant={type.active ? 'success' : 'default'} size="sm">
                          {type.active ? 'Activo' : 'De baja'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(type)} title="Editar">
                            <i className="ri-edit-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => { await setVehicleTypeActive(type.id, !type.active); await load(); }}
                            title={type.active ? 'Dar de baja' : 'Reactivar'}
                          >
                            <i className={type.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (!window.confirm(`¿Eliminar "${type.code}"? Las reglas que usen su capacidad dejarán de aplicar.`)) return;
                              await deleteVehicleType(type.id);
                              await load();
                            }}
                            title="Eliminar"
                          >
                            <i className="ri-delete-bin-line"></i>
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
