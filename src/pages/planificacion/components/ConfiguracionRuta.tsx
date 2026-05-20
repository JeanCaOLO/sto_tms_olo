import Card from '../../../components/base/Card';
import Select from '../../../components/base/Select';
import Input from '../../../components/base/Input';
import Button from '../../../components/base/Button';

interface Vehiculo {
  id: string;
  plate: string;
  type: string;
  capacity_kg: number;
  capacity_m3: number;
}

interface Conductor {
  id: string;
  full_name: string;
  document: string;
  carrier_id: string;
}

interface Transportista {
  id: string;
  name: string;
}

interface RutaTipo {
  id: string;
  name: string;
}

interface Props {
  rutas: RutaTipo[];
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  rutaTypeId: string;
  transportistaId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
  setRutaTypeId: (value: string) => void;
  setTransportistaId: (value: string) => void;
  setConductorId: (value: string) => void;
  setVehiculoId: (value: string) => void;
  setFechaRuta: (value: string) => void;
  vehiculoSeleccionado?: Vehiculo;
  totalWeight: number;
  totalVolume: number;
  pedidosCount: number;
  onGenerarRuta: () => void;
  onOptimizarRuta: () => void;
  generando: boolean;
}

export default function ConfiguracionRuta({
  rutas,
  transportistas,
  conductores,
  vehiculos,
  rutaTypeId,
  transportistaId,
  conductorId,
  vehiculoId,
  fechaRuta,
  setRutaTypeId,
  setTransportistaId,
  setConductorId,
  setVehiculoId,
  setFechaRuta,
  vehiculoSeleccionado,
  totalWeight,
  totalVolume,
  pedidosCount,
  onGenerarRuta,
  onOptimizarRuta,
  generando,
}: Props) {
  const conductoresFiltrados = transportistaId
    ? conductores.filter((c) => c.carrier_id === transportistaId)
    : conductores;

  const porcentajePeso = vehiculoSeleccionado
    ? Math.round((totalWeight / vehiculoSeleccionado.capacity_kg) * 100)
    : 0;

  const porcentajeVolumen = vehiculoSeleccionado
    ? Math.round((totalVolume / vehiculoSeleccionado.capacity_m3) * 100)
    : 0;

  const getColorCapacidad = (p: number) => {
    if (p >= 100) return 'text-red-600';
    if (p >= 80) return 'text-amber-600';
    return 'text-teal-600';
  };

  const getColorBarra = (p: number) => {
    if (p >= 100) return 'bg-red-500';
    if (p >= 80) return 'bg-amber-500';
    return 'bg-teal-500';
  };

  const puedeGenerar = rutaTypeId && conductorId && vehiculoId && pedidosCount > 0 && !generando;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          <i className="ri-settings-3-line mr-2 text-teal-600"></i>
          Configuración de Ruta
        </h2>
        {pedidosCount > 0 && (
          <button
            onClick={onOptimizarRuta}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-magic-line"></i>
            Optimizar paradas
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
        <Select
          label="Ruta"
          value={rutaTypeId}
          onChange={(e) => setRutaTypeId(e.target.value)}
          required
          options={[
            { value: '', label: 'Seleccionar ruta' },
            ...rutas.map((r) => ({ value: r.id, label: r.name }))
          ]}
        />

        <Select
          label="Transportista"
          value={transportistaId}
          onChange={(e) => setTransportistaId(e.target.value)}
          options={[
            { value: '', label: 'Todos' },
            ...transportistas.map((t) => ({ value: t.id, label: t.name }))
          ]}
        />

        <Select
          label="Conductor"
          value={conductorId}
          onChange={(e) => setConductorId(e.target.value)}
          required
          options={[
            { value: '', label: conductoresFiltrados.length === 0 ? 'Sin conductores' : 'Seleccionar conductor' },
            ...conductoresFiltrados.map((c) => ({ value: c.id, label: `${c.full_name} - ${c.document}` }))
          ]}
        />

        <Select
          label="Vehículo"
          value={vehiculoId}
          onChange={(e) => setVehiculoId(e.target.value)}
          required
          options={[
            { value: '', label: 'Seleccionar vehículo' },
            ...vehiculos.map((v) => ({ value: v.id, label: `${v.plate} - ${v.type}` }))
          ]}
        />

        <Input
          type="date"
          label="Fecha de Ruta"
          value={fechaRuta}
          onChange={(e) => setFechaRuta(e.target.value)}
          required
        />
      </div>

      {vehiculoSeleccionado && pedidosCount > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Capacidad del Vehículo</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1 text-sm">
                <span className="text-slate-600">Peso</span>
                <span className={`font-semibold ${getColorCapacidad(porcentajePeso)}`}>
                  {totalWeight.toFixed(1)} / {vehiculoSeleccionado.capacity_kg} kg ({porcentajePeso}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${getColorBarra(porcentajePeso)}`} style={{ width: `${Math.min(porcentajePeso, 100)}%` }}></div>
              </div>
              {porcentajePeso >= 100 && <p className="text-xs text-red-600 mt-1"><i className="ri-alert-line mr-1"></i>¡Sobrecarga de peso!</p>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1 text-sm">
                <span className="text-slate-600">Volumen</span>
                <span className={`font-semibold ${getColorCapacidad(porcentajeVolumen)}`}>
                  {totalVolume.toFixed(2)} / {vehiculoSeleccionado.capacity_m3} m³ ({porcentajeVolumen}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${getColorBarra(porcentajeVolumen)}`} style={{ width: `${Math.min(porcentajeVolumen, 100)}%` }}></div>
              </div>
              {porcentajeVolumen >= 100 && <p className="text-xs text-red-600 mt-1"><i className="ri-alert-line mr-1"></i>¡Sobrecarga de volumen!</p>}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          <i className="ri-map-pin-line mr-1 text-teal-600"></i>
          <span>{pedidosCount} {pedidosCount === 1 ? 'parada en ruta' : 'paradas en ruta'}</span>
        </div>
        <Button onClick={onGenerarRuta} disabled={!puedeGenerar} className="whitespace-nowrap">
          {generando ? (
            <><i className="ri-loader-4-line animate-spin mr-2"></i>Generando...</>
          ) : (
            <><i className="ri-check-double-line mr-2"></i>Generar Ruta</>
          )}
        </Button>
      </div>
    </Card>
  );
}
