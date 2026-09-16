// Rutas comerciales de una compañía.
//
// Existe acá y no en una pantalla global porque **cada transportista cubre sus propias rutas a sus
// propios precios**: la misma lane Carabobo → Caracas puede costar distinto según quién la haga, y
// una lista global obligaría a repetir la compañía en cada fila.
//
// La ruta aporta los datos del viaje al liquidar —zonas, kilómetros, paradas, bultos, peso,
// peajes—, que hasta ahora se tecleaban uno por uno en cada liquidación. Y las zonas dejan de
// elegirse a mano: la ruta las declara.
//
// La TARIFA no está acá: sale del tarifario de la compañía, con clave (zona origen, zona destino).

import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import Badge from '../../../components/base/Badge';
import {
  deleteRoute, listRoutes, saveRoute, setRouteActive,
  type RouteErrors, type RouteInput,
} from '../../../lib/tarifas/routesDataSource';
import { loadZones } from '../../../lib/tarifas/catalogLoader';
import type { RouteDef, Zone } from '../../../lib/tarifas/types';
import type { SettlementPartyRow } from '../../../lib/tarifas/parties';

interface Props {
  isOpen: boolean;
  party: SettlementPartyRow | null;
  onClose: () => void;
}

const emptyForm = (countryId: string, partyId: string): RouteInput => ({
  countryId,
  partyId,
  code: '',
  name: '',
  originZoneId: '',
  destZoneId: '',
  km: '0',
  stopCount: '0',
  packageCount: '0',
  weightKg: '0',
  tollCount: '0',
  tollsAmount: '0',
  durationHours: '0',
  notes: null,
  active: true,
});

export default function RoutesModal({ isOpen, party, onClose }: Props) {
  const [routes, setRoutes] = useState<RouteDef[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<RouteInput>(emptyForm('', ''));
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<RouteErrors>({});
  const [generalError, setGeneralError] = useState('');

  const load = useCallback(async () => {
    if (!party) return;
    setLoading(true);
    try {
      setRoutes(await listRoutes(party.id, { includeInactive: true }));
      setZones(loadZones(party.country_id));
    } finally {
      setLoading(false);
    }
  }, [party]);

  useEffect(() => {
    if (!isOpen || !party) return;
    setForm(emptyForm(party.country_id, party.id));
    setEditingId(undefined);
    setErrors({});
    setGeneralError('');
    void load();
  }, [isOpen, party, load]);

  if (!isOpen || !party) return null;

  const set = <K extends keyof RouteInput>(key: K, value: RouteInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const cancelEdit = () => {
    setEditingId(undefined);
    setForm(emptyForm(party.country_id, party.id));
    setErrors({});
  };

  const startEdit = (route: RouteDef) => {
    setEditingId(route.id);
    setErrors({});
    setGeneralError('');
    setForm({
      countryId: route.countryId,
      partyId: route.partyId,
      code: route.code,
      name: route.name,
      originZoneId: route.originZoneId,
      destZoneId: route.destZoneId,
      km: String(route.km),
      stopCount: String(route.stopCount),
      packageCount: String(route.packageCount),
      weightKg: String(route.weightKg),
      tollCount: String(route.tollCount),
      tollsAmount: route.tollsAmount,
      durationHours: String(route.durationHours),
      notes: route.notes,
      active: route.active,
    });
  };

  const handleSave = async () => {
    setGeneralError('');
    const result = await saveRoute(form, editingId);
    if (result.status === 'invalid') { setErrors(result.errors); return; }
    if (result.status === 'failed') { setGeneralError(result.error.message); return; }
    cancelEdit();
    await load();
  };

  const zoneLabel = (id: string) => {
    const z = zones.find((zone) => zone.id === id);
    return z ? z.code : id;
  };

  const zoneOptions = [
    { value: '', label: 'Elegir…' },
    ...zones.map((z) => ({ value: z.id, label: `${z.code} — ${z.name}` })),
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Rutas de {party.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada ruta aporta los datos del viaje al liquidar. Su precio sale del tarifario de la
              compañía.
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
              Al elegir esta ruta en una liquidación se completan solos <strong>zona de origen y
              destino, kilómetros, paradas, bultos, peso, peajes y duración</strong>. Un viaje
              excepcional puede corregir cualquiera de esos números sin tocar la ruta.
            </span>
          </div>

          {/* ── Alta / edición ────────────────────────────────────────────────────────────── */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar ruta' : 'Nueva ruta'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                label="Código *"
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="CAR-CCS"
                error={errors.code}
                disabled={!!editingId}
              />
              <Input
                label="Nombre *"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Carabobo → Caracas Norte"
                error={errors.name}
              />
              <Select
                label="Zona de origen *"
                value={form.originZoneId}
                onChange={(e) => set('originZoneId', e.target.value)}
                options={zoneOptions}
                error={errors.originZoneId}
              />
              <Select
                label="Zona de destino *"
                value={form.destZoneId}
                onChange={(e) => set('destZoneId', e.target.value)}
                options={zoneOptions}
                error={errors.destZoneId}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <Input label="Km" type="number" value={form.km} onChange={(e) => set('km', e.target.value)} error={errors.km} />
              <Input label="Paradas" type="number" value={form.stopCount} onChange={(e) => set('stopCount', e.target.value)} error={errors.stopCount} />
              <Input label="Bultos" type="number" value={form.packageCount} onChange={(e) => set('packageCount', e.target.value)} error={errors.packageCount} />
              <Input label="Peso (kg)" type="number" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} error={errors.weightKg} />
              <Input label="Peajes" type="number" value={form.tollCount} onChange={(e) => set('tollCount', e.target.value)} error={errors.tollCount} />
              <Input label="Monto peajes" value={form.tollsAmount} onChange={(e) => set('tollsAmount', e.target.value)} error={errors.tollsAmount} />
              <Input label="Horas" type="number" value={form.durationHours} onChange={(e) => set('durationHours', e.target.value)} error={errors.durationHours} />
            </div>

            <div className="flex justify-end gap-2">
              {editingId && <Button type="button" variant="secondary" onClick={cancelEdit}>Cancelar</Button>}
              <Button type="button" onClick={() => void handleSave()}>
                <i className="ri-save-line mr-1"></i>
                {editingId ? 'Guardar cambios' : 'Agregar ruta'}
              </Button>
            </div>
          </div>

          {/* ── Listado ───────────────────────────────────────────────────────────────────── */}
          {loading ? (
            <p className="text-sm text-slate-500 py-6 text-center">Cargando…</p>
          ) : routes.length === 0 ? (
            <div className="text-center py-8">
              <i className="ri-route-line text-3xl text-slate-300"></i>
              <p className="mt-2 text-sm text-slate-600 font-medium">Esta compañía no tiene rutas cargadas</p>
              <p className="text-xs text-slate-500">
                Sin rutas, cada liquidación tiene que teclear siete números a mano y elegir las dos
                zonas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Ruta</th>
                    <th className="px-3 py-2 text-right">Km</th>
                    <th className="px-3 py-2 text-right">Paradas</th>
                    <th className="px-3 py-2 text-right">Bultos</th>
                    <th className="px-3 py-2 text-right">Peajes</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {routes.map((route) => (
                    <tr key={route.id} className={route.active ? '' : 'bg-slate-50/60'}>
                      <td className="px-3 py-2 font-mono text-xs text-teal-700">{route.code}</td>
                      <td className="px-3 py-2 text-slate-800">
                        <div>{route.name}</div>
                        <div className="text-xs text-slate-500">
                          {zoneLabel(route.originZoneId)} → {zoneLabel(route.destZoneId)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{route.km}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{route.stopCount}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{route.packageCount}</td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {route.tollCount > 0 ? `${route.tollCount} · ${route.tollsAmount}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={route.active ? 'success' : 'default'} size="sm">
                          {route.active ? 'Activa' : 'De baja'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(route)} title="Editar">
                            <i className="ri-edit-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => { await setRouteActive(route.id, !route.active); await load(); }}
                            title={route.active ? 'Dar de baja' : 'Reactivar'}
                          >
                            <i className={route.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (!window.confirm(
                                `¿Eliminar la ruta "${route.code}"? Las liquidaciones emitidas que la nombren van a quedar sin su geografía.`,
                              )) return;
                              const { error } = await deleteRoute(route.id);
                              if (error) { setGeneralError(error); return; }
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
