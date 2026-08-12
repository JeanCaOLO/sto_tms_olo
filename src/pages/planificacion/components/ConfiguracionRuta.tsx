import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import RouteConfigForm from './RouteConfigForm';
import CapacityBar from './CapacityBar';
import type { Conductor, RutaTipo, Transportista, Vehiculo } from '../types';

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

export default function ConfiguracionRuta(props: Props) {
  const { vehiculoSeleccionado, totalWeight, totalVolume, pedidosCount, rutaTypeId, conductorId, vehiculoId, generando } = props;
  const puedeGenerar = Boolean(rutaTypeId && conductorId && vehiculoId && pedidosCount > 0 && !generando);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          <i className="ri-settings-3-line mr-2 text-teal-600"></i>
          Configuración de Ruta
        </h2>
        {pedidosCount > 0 && (
          <button
            onClick={props.onOptimizarRuta}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-magic-line"></i>
            Optimizar paradas
          </button>
        )}
      </div>

      <RouteConfigForm {...props} />

      {vehiculoSeleccionado && pedidosCount > 0 && (
        <div className="bg-slate-50 rounded-lg p-4 mt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Capacidad del Vehículo</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CapacityBar icon="ri-weight-line" label="Peso" value={totalWeight} max={vehiculoSeleccionado.capacity_kg} unit="kg" decimals={1} />
            <CapacityBar icon="ri-box-3-line" label="Volumen" value={totalVolume} max={vehiculoSeleccionado.capacity_m3} unit="m³" decimals={2} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-slate-500">
          <i className="ri-map-pin-line mr-1 text-teal-600"></i>
          <span>{pedidosCount} {pedidosCount === 1 ? 'parada en ruta' : 'paradas en ruta'}</span>
        </div>
        <Button onClick={props.onGenerarRuta} disabled={!puedeGenerar} className="whitespace-nowrap">
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
