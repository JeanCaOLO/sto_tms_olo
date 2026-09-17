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
import type { Conductor, RutaTipo, Vehiculo, Viaje } from '../types';

interface Props {
  rutas: RutaTipo[];
  vehiculos: Vehiculo[];
  conductores: Conductor[];
  viajes: Viaje[];
  onRutasGeneradas: () => void;
}

export default function FlotaSplitTab({ rutas, vehiculos, conductores, viajes, onRutasGeneradas }: Props) {
  const { appUser } = useAuth();
  const [fechaRuta, setFechaRuta] = useState(new Date().toISOString().split('T')[0]);
  const {
    rutaTypeId, viajeId, pool, cargando, slots, resultado,
    setRutaTypeId, setViaje, addSlot, removeSlot, sugerirFlota, calcularReparto, reset,
  } = useFlotaSplit(appUser);
  const { generarFlota, generando } = useGenerarFlota();

  const viajesDeRuta = viajes.filter((v) => v.route_type_id === rutaTypeId);
  const totalPeso = pool.reduce((s, p) => s + (p.total_weight || 0), 0);
  const totalVol = pool.reduce((s, p) => s + (p.total_volume || 0), 0);

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
          <i className="ri-stack-line mr-2 text-teal-600"></i>Reparto de Flota
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Elige una ruta y un viaje de esa ruta; sus pedidos reales se reparten entre los vehículos respetando la capacidad de cada uno.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Select
            label="Ruta"
            value={rutaTypeId}
            onChange={(e) => setRutaTypeId(e.target.value)}
            options={[{ value: '', label: 'Seleccionar ruta' }, ...rutas.map((r) => ({ value: r.id, label: r.name }))]}
          />
          <Select
            label="Viaje de la ruta"
            value={viajeId}
            onChange={(e) => setViaje(e.target.value)}
            disabled={!rutaTypeId}
            options={[
              { value: '', label: rutaTypeId ? (viajesDeRuta.length ? 'Seleccionar viaje' : 'Sin viajes en esta ruta') : 'Elige una ruta primero' },
              ...viajesDeRuta.map((v) => ({ value: v.id, label: `${v.trip_number} · ${v.trip_date}` })),
            ]}
          />
          <Input type="date" label="Fecha de Ruta" value={fechaRuta} onChange={(e) => setFechaRuta(e.target.value)} />
        </div>

        {viajeId && (
          <p className="text-sm text-slate-600 mb-4">
            {cargando ? 'Cargando pedidos del viaje...' : `${pool.length} pedidos · ${totalPeso.toFixed(1)} kg · ${totalVol.toFixed(2)} m³`}
          </p>
        )}

        <div className="flex justify-end mb-2">
          <Button
            variant="ghost"
            className="text-sm"
            onClick={() => sugerirFlota(vehiculos)}
            disabled={pool.length === 0}
            title="Elige automáticamente los vehículos que cubren el viaje y reparte sus pedidos"
          >
            <i className="ri-magic-line mr-1"></i>Sugerir vehículos por capacidad
          </Button>
        </div>

        <FlotaSlotPicker vehiculos={vehiculos} conductores={conductores} slots={slots} onAdd={addSlot} onRemove={removeSlot} />

        <div className="flex gap-3 mt-4">
          <Button variant="secondary" onClick={calcularReparto} disabled={slots.length === 0 || pool.length === 0}>
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
