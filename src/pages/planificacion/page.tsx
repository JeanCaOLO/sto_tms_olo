import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import NuevaRutaTab from './components/NuevaRutaTab';
import FlotaSplitTab from './components/FlotaSplitTab';
import RutasGeneradas from './components/RutasGeneradas';
import EditarRutaModal from './components/EditarRutaModal';
import PlanificacionTabs from './components/PlanificacionTabs';
import { useCatalogos } from './use-catalogos';
import { useViajes } from './use-viajes';
import { usePedidosRuta } from './use-pedidos-ruta';
import { usePedidosAnclados } from './use-pedidos-anclados';
import { useGenerarRuta } from './use-generar-ruta';
import { useRutasGeneradas } from './use-rutas-generadas';
import type { Pedido } from './types';
import type { RutaGenerada } from './generar-ruta-mock';

type Tab = 'nueva' | 'flota' | 'generadas';

export default function PlanificacionPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('nueva');
  const { rutas, vehiculos, transportistas, conductores, loading } = useCatalogos(appUser);
  const { viajes, cargandoViajes } = useViajes(appUser);
  const {
    viajeId, pedidosRuta, pedidosSeleccionados, excluidosPorCapacidad, optimizando,
    setViaje, togglePedido, quitarPedido, reordenarParadas, optimizarRuta, resetPedidos,
    agregarDevolucionEnVivo,
  } = usePedidosRuta();
  const { anclados, toggleAnclaConValidacion, limpiarAnclas } = usePedidosAnclados();
  const { generarRuta, generando } = useGenerarRuta({ appUser, vehiculos, rutas });
  const { rutas: rutasGeneradas, refresh: refreshRutasGeneradas, eliminar: eliminarRutaGenerada, actualizar: actualizarRutaGenerada, cambiarEstado: cambiarEstadoRutaGenerada } = useRutasGeneradas();
  const rutaTypeId = viajes.find((v) => v.id === viajeId)?.route_type_id || '';
  const [editandoRuta, setEditandoRuta] = useState<RutaGenerada | null>(null);

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

  const handleOptimizarRuta = async () => {
    const sinCoords = pedidosRuta.filter((p) => p.delivery_latitude == null || p.delivery_longitude == null).length;
    if (sinCoords > 0) {
      showToast(`${sinCoords} pedido(s) con dirección de excepción (sin coordenadas) quedan fuera del cálculo de ruta óptima.`, 'warning');
    }
    const result = await optimizarRuta(vehiculoSeleccionado, anclados);
    if (result?.fuente === 'haversine') {
      showToast('No se pudo contactar el servicio de rutas (OSRM); se usó una distancia estimada en línea recta.', 'warning');
    }
    if (result?.fueraDeVentana && result.fueraDeVentana > 0) {
      showToast(`${result.fueraDeVentana} parada(s) con hora estimada de llegada fuera de la ventana de entrega (8:00–19:00).`, 'warning');
    }
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

      <PlanificacionTabs tab={tab} setTab={setTab} rutasGeneradasCount={rutasGeneradas.length} />

      {tab === 'generadas' && (
        <RutasGeneradas
          rutas={rutasGeneradas}
          rutasTipo={rutas}
          transportistas={transportistas}
          conductores={conductores}
          vehiculos={vehiculos}
          onEliminar={eliminarRutaGenerada}
          onEditar={setEditandoRuta}
          onCambiarEstado={cambiarEstadoRutaGenerada}
        />
      )}

      <EditarRutaModal
        ruta={editandoRuta}
        transportistas={transportistas}
        conductores={conductores}
        vehiculos={vehiculos}
        onClose={() => setEditandoRuta(null)}
        onGuardar={actualizarRutaGenerada}
      />

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
          optimizando={optimizando}
          onTogglePedido={togglePedido}
          onToggleAncla={handleToggleAncla}
          onQuitarPedido={quitarPedido}
          onReordenarParadas={reordenarParadas}
          onAgregarDevolucionEnVivo={agregarDevolucionEnVivo}
          onGenerarRuta={handleGenerarRuta}
          onOptimizarRuta={handleOptimizarRuta}
        />
      )}
    </div>
  );
}
