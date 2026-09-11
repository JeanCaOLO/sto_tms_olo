import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import Input from '../../../components/base/Input';
import FlotaSlotPicker from './FlotaSlotPicker';
import FlotaResultadoPreview from './FlotaResultadoPreview';
import { useFlotaSplit } from '../use-flota-split';
import { useGenerarFlota } from '../use-generar-flota';
import type { Conductor, RutaTipo, Vehiculo } from '../types';

interface Props {
  rutas: RutaTipo[];
  vehiculos: Vehiculo[];
  conductores: Conductor[];
  onRutasGeneradas: () => void;
}

export default function FlotaSplitTab({ rutas, vehiculos, conductores, onRutasGeneradas }: Props) {
  const { appUser } = useAuth();
  const [fechaRuta, setFechaRuta] = useState(new Date().toISOString().split('T')[0]);
  const {
    rutaTypeId, pool, cargando, slots, resultado,
    setRutaTypeId, addSlot, removeSlot, calcularReparto, reset,
  } = useFlotaSplit(appUser);
  const { generarFlota, generando } = useGenerarFlota();

  const totalPeso = pool.reduce((s, p) => s + (p.total_weight || 0), 0);

  const handleGenerar = () => {
    if (!resultado) return;
    generarFlota(resultado.asignaciones, rutaTypeId, fechaRuta, () => {
      reset();
      onRutasGeneradas();
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          <i className="ri-stack-line mr-2 text-teal-600"></i>
          Reparto de Flota
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Elige una ruta y varios vehículos: el pool de pedidos se reparte automáticamente entre ellos respetando la capacidad de cada uno.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Select
            label="Ruta"
            value={rutaTypeId}
            onChange={(e) => setRutaTypeId(e.target.value)}
            options={[{ value: '', label: 'Seleccionar ruta' }, ...rutas.map((r) => ({ value: r.id, label: r.name }))]}
          />
          <Input type="date" label="Fecha de Ruta" value={fechaRuta} onChange={(e) => setFechaRuta(e.target.value)} />
        </div>

        {rutaTypeId && (
          <p className="text-sm text-slate-600 mb-4">
            {cargando ? 'Cargando pedidos...' : `${pool.length} pedidos pendientes en el pool (${totalPeso.toFixed(1)} kg)`}
          </p>
        )}

        <FlotaSlotPicker vehiculos={vehiculos} conductores={conductores} slots={slots} onAdd={addSlot} onRemove={removeSlot} />

        <div className="flex gap-3 mt-4">
          <Button variant="secondary" onClick={calcularReparto} disabled={!rutaTypeId || slots.length === 0 || pool.length === 0}>
            <i className="ri-refresh-line mr-1"></i>Calcular Reparto
          </Button>
          {resultado && (
            <Button onClick={handleGenerar} disabled={generando || resultado.asignaciones.length === 0}>
              {generando ? 'Generando...' : `Generar ${resultado.asignaciones.length} Ruta(s)`}
            </Button>
          )}
        </div>
      </Card>

      {resultado && <FlotaResultadoPreview resultado={resultado} conductores={conductores} />}
    </div>
  );
}
