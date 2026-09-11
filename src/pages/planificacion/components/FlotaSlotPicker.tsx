import { useState } from 'react';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import type { Conductor, Vehiculo } from '../types';
import type { FlotaSlot } from '../fleet-split';

interface Props {
  vehiculos: Vehiculo[];
  conductores: Conductor[];
  slots: FlotaSlot[];
  onAdd: (slot: FlotaSlot) => void;
  onRemove: (index: number) => void;
}

export default function FlotaSlotPicker({ vehiculos, conductores, slots, onAdd, onRemove }: Props) {
  const [vehiculoId, setVehiculoId] = useState('');
  const [conductorId, setConductorId] = useState('');

  const disponibles = vehiculos.filter((v) => !slots.some((s) => s.vehiculo.id === v.id));

  const handleAdd = () => {
    const vehiculo = vehiculos.find((v) => v.id === vehiculoId);
    if (!vehiculo) return;
    onAdd({ vehiculo, conductorId });
    setVehiculoId('');
    setConductorId('');
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <Select
          label="Vehículo"
          value={vehiculoId}
          onChange={(e) => setVehiculoId(e.target.value)}
          options={[{ value: '', label: 'Seleccionar vehículo' }, ...disponibles.map((v) => ({ value: v.id, label: `${v.plate} - ${v.brand} ${v.model}` }))]}
        />
        <Select
          label="Conductor (opcional)"
          value={conductorId}
          onChange={(e) => setConductorId(e.target.value)}
          options={[{ value: '', label: 'Sin asignar' }, ...conductores.map((c) => ({ value: c.id, label: c.full_name }))]}
        />
        <Button onClick={handleAdd} disabled={!vehiculoId} className="whitespace-nowrap">
          <i className="ri-add-line mr-1"></i>Agregar
        </Button>
      </div>

      {slots.length > 0 && (
        <div className="mt-4 space-y-2">
          {slots.map((slot, i) => (
            <div key={slot.vehiculo.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <span>
                <i className="ri-truck-line mr-1.5 text-slate-400"></i>
                {slot.vehiculo.plate} — {slot.vehiculo.brand} {slot.vehiculo.model}
                {slot.conductorId && ` · ${conductores.find((c) => c.id === slot.conductorId)?.full_name || ''}`}
              </span>
              <button onClick={() => onRemove(i)} className="text-slate-400 hover:text-red-600 cursor-pointer">
                <i className="ri-close-line"></i>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
