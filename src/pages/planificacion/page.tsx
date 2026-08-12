import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import PedidosRuta from './components/PedidosRuta';
import RutaEnConstruccion from './components/RutaEnConstruccion';
import ConfiguracionRuta from './components/ConfiguracionRuta';
import RutasGeneradas from './components/RutasGeneradas';
import { useCatalogos } from './use-catalogos';
import { usePedidosRuta } from './use-pedidos-ruta';
import { usePedidosAnclados } from './use-pedidos-anclados';
import { useGenerarRuta } from './use-generar-ruta';
import { useRutasGeneradas } from './use-rutas-generadas';

type Tab = 'nueva' | 'generadas';

export default function PlanificacionPage() {
  const { appUser } = useAuth();
  const [tab, setTab] = useState<Tab>('nueva');
  const { rutas, vehiculos, transportistas, conductores, loading } = useCatalogos(appUser);
  const {
    rutaTypeId, pedidosRuta, pedidosSeleccionados, cargandoPedidos, excluidosPorCapacidad,
    setRutaTypeId, togglePedido, quitarPedido, reordenarParadas, optimizarRuta, resetPedidos,
  } = usePedidosRuta(appUser);
  const { anclados, toggleAncla } = usePedidosAnclados();
  const { generarRuta, generando } = useGenerarRuta({ appUser, vehiculos, rutas });
  const { rutas: rutasGeneradas, refresh: refreshRutasGeneradas, eliminar: eliminarRutaGenerada } = useRutasGeneradas();

  const [transportistaId, setTransportistaId] = useState('');
  const [conductorId, setConductorId] = useState('');
  const [vehiculoId, setVehiculoId] = useState('');
  const [fechaRuta, setFechaRuta] = useState(new Date().toISOString().split('T')[0]);

  const handleSetTransportistaId = (value: string) => {
    setTransportistaId(value);
    setConductorId('');
  };

  const handleGenerarRuta = () => {
    generarRuta({ pedidosSeleccionados, rutaTypeId, transportistaId, conductorId, vehiculoId, fechaRuta }, () => {
      resetPedidos();
      setTransportistaId('');
      setConductorId('');
      setVehiculoId('');
      setFechaRuta(new Date().toISOString().split('T')[0]);
      refreshRutasGeneradas();
      setTab('generadas');
    });
  };

  const vehiculoSeleccionado = vehiculos.find((v) => v.id === vehiculoId);
  const totalWeight = pedidosSeleccionados.reduce((s, p) => s + (p.total_weight || 0), 0);
  const totalVolume = pedidosSeleccionados.reduce((s, p) => s + (p.total_volume || 0), 0);
  const rutaNombre = rutas.find((r) => r.id === rutaTypeId)?.name || '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Planificación de Rutas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Selecciona una ruta del catálogo, asigna transportista, conductor y vehículo, y genera la ruta óptima de entrega
          </p>
        </div>
        {tab === 'nueva' && pedidosSeleccionados.length > 0 && (
          <div className="flex items-center gap-2 text-sm bg-teal-50 border border-teal-200 text-teal-700 px-3 py-2 rounded-lg flex-shrink-0">
            <i className="ri-checkbox-circle-line"></i>
            <span><strong>{pedidosSeleccionados.length}</strong> de <strong>{pedidosRuta.length}</strong> pedidos incluidos</span>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setTab('nueva')}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
            tab === 'nueva' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="ri-add-circle-line mr-1.5"></i>Nueva Ruta
        </button>
        <button
          onClick={() => setTab('generadas')}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
            tab === 'generadas' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="ri-route-line mr-1.5"></i>Rutas Generadas
          {rutasGeneradas.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs bg-teal-100 text-teal-700 rounded-full">
              {rutasGeneradas.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'generadas' ? (
        <RutasGeneradas
          rutas={rutasGeneradas}
          rutasTipo={rutas}
          transportistas={transportistas}
          conductores={conductores}
          vehiculos={vehiculos}
          onEliminar={eliminarRutaGenerada}
        />
      ) : (
      <>
      {excluidosPorCapacidad > 0 && (
        <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg">
          <i className="ri-alert-line text-amber-600"></i>
          <span>
            {excluidosPorCapacidad} pedido(s) no cab{excluidosPorCapacidad === 1 ? 'e' : 'en'} en el vehículo (margen de seguridad: 85% peso / 95% volumen) y qued{excluidosPorCapacidad === 1 ? 'ó' : 'aron'} excluido{excluidosPorCapacidad === 1 ? '' : 's'} — reasígnalos a otro viaje.
          </span>
        </div>
      )}
      <ConfiguracionRuta
        rutas={rutas}
        transportistas={transportistas}
        conductores={conductores}
        vehiculos={vehiculos}
        rutaTypeId={rutaTypeId}
        transportistaId={transportistaId}
        conductorId={conductorId}
        vehiculoId={vehiculoId}
        fechaRuta={fechaRuta}
        setRutaTypeId={setRutaTypeId}
        setTransportistaId={handleSetTransportistaId}
        setConductorId={setConductorId}
        setVehiculoId={setVehiculoId}
        setFechaRuta={setFechaRuta}
        vehiculoSeleccionado={vehiculoSeleccionado}
        totalWeight={totalWeight}
        totalVolume={totalVolume}
        pedidosCount={pedidosSeleccionados.length}
        onGenerarRuta={handleGenerarRuta}
        onOptimizarRuta={() => optimizarRuta(vehiculoSeleccionado, anclados)}
        generando={generando}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PedidosRuta
          rutaNombre={rutaNombre}
          pedidos={pedidosRuta}
          pedidosIncluidos={pedidosSeleccionados.map((p) => p.id)}
          pedidosAnclados={anclados}
          onTogglePedido={togglePedido}
          onToggleAncla={toggleAncla}
          rutaSeleccionada={!!rutaTypeId}
          cargandoPedidos={cargandoPedidos}
        />

        <RutaEnConstruccion
          pedidosSeleccionados={pedidosSeleccionados}
          onQuitarPedido={quitarPedido}
          onReordenarParadas={reordenarParadas}
        />
      </div>
      </>
      )}
    </div>
  );
}
