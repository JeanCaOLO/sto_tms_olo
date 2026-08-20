import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import NuevaRutaTab from './components/NuevaRutaTab';
import FlotaSplitTab from './components/FlotaSplitTab';
import RutasGeneradas from './components/RutasGeneradas';
import { useCatalogos } from './use-catalogos';
import { useViajes } from './use-viajes';
import { usePedidosRuta } from './use-pedidos-ruta';
import { usePedidosAnclados } from './use-pedidos-anclados';
import { useGenerarRuta } from './use-generar-ruta';
import { useRutasGeneradas } from './use-rutas-generadas';
import type { Pedido } from './types';

type Tab = 'nueva' | 'flota' | 'generadas';

export default function PlanificacionPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('nueva');
  const { rutas, vehiculos, transportistas, conductores, loading } = useCatalogos(appUser);
  const { viajes, cargandoViajes } = useViajes(appUser);
  const {
    viajeId, pedidosRuta, pedidosSeleccionados, excluidosPorCapacidad,
    setViaje, togglePedido, quitarPedido, reordenarParadas, optimizarRuta, resetPedidos,
  } = usePedidosRuta();
  const { anclados, toggleAnclaConValidacion, limpiarAnclas } = usePedidosAnclados();
  const { generarRuta, generando } = useGenerarRuta({ appUser, vehiculos, rutas });
  const { rutas: rutasGeneradas, refresh: refreshRutasGeneradas, eliminar: eliminarRutaGenerada } = useRutasGeneradas();
  const rutaTypeId = viajes.find((v) => v.id === viajeId)?.route_type_id || '';

  const [transportistaId, setTransportistaId] = useState('');
  const [conductorId, setConductorId] = useState('');
  const [vehiculoId, setVehiculoId] = useState('');
  const [fechaRuta, setFechaRuta] = useState(new Date().toISOString().split('T')[0]);
  const vehiculoSeleccionado = vehiculos.find((v) => v.id === vehiculoId);

  const handleSetViajeId = (value: string) => {
    setViaje(viajes.find((v) => v.id === value));
    limpiarAnclas();
  };

  const handleSetTransportistaId = (value: string) => {
    setTransportistaId(value);
    setConductorId('');
  };

  const handleToggleAncla = (pedido: Pedido) =>
    toggleAnclaConValidacion(pedido, vehiculoSeleccionado, pedidosSeleccionados);

  const handleOptimizarRuta = () => {
    const sinCoords = pedidosRuta.filter((p) => p.delivery_latitude == null || p.delivery_longitude == null).length;
    if (sinCoords > 0) {
      showToast(`${sinCoords} pedido(s) con dirección de excepción (sin coordenadas) quedan fuera del cálculo de ruta óptima.`, 'warning');
    }
    optimizarRuta(vehiculoSeleccionado, anclados);
  };

  const handleGenerarRuta = () => {
    generarRuta({ pedidosSeleccionados, rutaTypeId, transportistaId, conductorId, vehiculoId, fechaRuta }, () => {
      resetPedidos();
      limpiarAnclas();
      setTransportistaId('');
      setConductorId('');
      setVehiculoId('');
      setFechaRuta(new Date().toISOString().split('T')[0]);
      refreshRutasGeneradas();
      setTab('generadas');
    });
  };

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
            Selecciona un viaje despachado, asigna transportista, conductor y vehículo, y genera la ruta óptima de entrega
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
          onClick={() => setTab('flota')}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
            tab === 'flota' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="ri-stack-line mr-1.5"></i>Reparto de Flota
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

      {tab === 'generadas' && (
        <RutasGeneradas
          rutas={rutasGeneradas}
          rutasTipo={rutas}
          transportistas={transportistas}
          conductores={conductores}
          vehiculos={vehiculos}
          onEliminar={eliminarRutaGenerada}
        />
      )}

      {tab === 'flota' && (
        <FlotaSplitTab
          rutas={rutas}
          vehiculos={vehiculos}
          conductores={conductores}
          onRutasGeneradas={() => {
            refreshRutasGeneradas();
            setTab('generadas');
          }}
        />
      )}

      {tab === 'nueva' && (
        <NuevaRutaTab
          viajes={viajes}
          vehiculos={vehiculos}
          transportistas={transportistas}
          conductores={conductores}
          viajeId={viajeId}
          transportistaId={transportistaId}
          conductorId={conductorId}
          vehiculoId={vehiculoId}
          fechaRuta={fechaRuta}
          setViajeId={handleSetViajeId}
          setTransportistaId={handleSetTransportistaId}
          setConductorId={setConductorId}
          setVehiculoId={setVehiculoId}
          setFechaRuta={setFechaRuta}
          vehiculoSeleccionado={vehiculoSeleccionado}
          pedidosRuta={pedidosRuta}
          pedidosSeleccionados={pedidosSeleccionados}
          pedidosAnclados={anclados}
          cargandoPedidos={cargandoViajes}
          excluidosPorCapacidad={excluidosPorCapacidad}
          rutaNombre={rutaNombre}
          generando={generando}
          onTogglePedido={togglePedido}
          onToggleAncla={handleToggleAncla}
          onQuitarPedido={quitarPedido}
          onReordenarParadas={reordenarParadas}
          onGenerarRuta={handleGenerarRuta}
          onOptimizarRuta={handleOptimizarRuta}
        />
      )}
    </div>
  );
}
