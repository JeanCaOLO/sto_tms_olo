import { useState } from 'react';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { WEEK_DAYS, WEEK_DAY_LABELS, type DispatchRoute, type RouteType, type WeekDay } from '../types';

interface RouteFormModalProps {
  country: 'CR' | 'VE';
  onSave: (route: Omit<DispatchRoute, 'country' | 'exceptions' | 'byAppointment'>) => void;
  onCancel: () => void;
}

// FR1.2 — alta de ruta: identificador, nombre, tipo, al menos un día de salida,
// estado. Mock: no persiste fuera de la sesión.
export default function RouteFormModal({ country, onSave, onCancel }: RouteFormModalProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [routeType, setRouteType] = useState<RouteType>('Rural');
  const [loadDays, setLoadDays] = useState<WeekDay[]>([]);
  const [active, setActive] = useState(true);

  const toggleDay = (d: WeekDay) => {
    setLoadDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  // FR1.2: rechazar si no hay al menos un día de salida.
  const valid = id.trim().length > 0 && name.trim().length > 0 && loadDays.length > 0;

  const submit = () => {
    if (!valid) return;
    const ordered = WEEK_DAYS.filter((d) => loadDays.includes(d));
    onSave({ id: id.trim(), name: name.trim(), routeType, loadDays: ordered, deliveryDays: [], active });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Nueva ruta">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Nueva Ruta — {country === 'CR' ? 'Costa Rica' : 'Venezuela'}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Identificador (zona)" value={id} onChange={(e) => setId(e.target.value)} placeholder="Ej.: 40" />
            <Select
              label="Tipo"
              value={routeType}
              onChange={(e) => setRouteType(e.target.value as RouteType)}
              options={[{ value: 'Rural', label: 'Rural' }, { value: 'GAM', label: 'GAM' }]}
            />
          </div>

          <Input label="Nombre de la ruta" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Nicoya" />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Días de salida (carga)</label>
            <div className="flex gap-1.5">
              {WEEK_DAYS.map((d) => {
                const on = loadDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    title={WEEK_DAY_LABELS[d]}
                    aria-pressed={on}
                    className={`w-9 h-9 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                      on ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {loadDays.length === 0 && (
              <p className="mt-1.5 text-sm text-amber-600">Selecciona al menos un día de salida.</p>
            )}
          </div>

          <Select
            label="Estado"
            value={active ? 'activa' : 'inactiva'}
            onChange={(e) => setActive(e.target.value === 'activa')}
            options={[{ value: 'activa', label: 'Activa' }, { value: 'inactiva', label: 'Inactiva' }]}
          />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>Crear ruta</Button>
        </div>
      </div>
    </div>
  );
}
