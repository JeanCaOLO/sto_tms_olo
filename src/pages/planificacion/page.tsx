import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import NuevaRutaTab from './components/NuevaRutaTab';
import FlotaSplitTab from './components/FlotaSplitTab';
import RutasGeneradas from './components/RutasGeneradas';
import EditarRutaModal from './components/EditarRutaModal';
import PlanificacionTabs from './components/PlanificacionTabs';
import MatrizRutasTab from './components/MatrizRutasTab';
import AsignarViajesTab from './components/AsignarViajesTab';
import MaestrosTab from './components/MaestrosTab';
import PlanificacionHeader from './components/PlanificacionHeader';
import { useCatalogos } from './use-catalogos';
import { useViajes } from './use-viajes';
import { useCompanias } from './use-companias';
import { useTabRoute } from './use-tab-route';
import { getPais, setPais, getCompania, setCompania, getDemo, setDemo, type Pais } from './eflow-api';
import { usePedidosRuta } from './use-pedidos-ruta';
import { usePedidosAnclados } from './use-pedidos-anclados';
import { useGenerarRuta } from './use-generar-ruta';
import { useRutasGeneradas } from './use-rutas-generadas';
import type { Pedido } from './types';
import type { RutaGenerada } from './generar-ruta-mock';

export default function PlanificacionPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useTabRoute('nueva');
  const [pais, setPaisState] = useState<Pais>(getPais());
  const [company, setCompanyState] = useState<string>(getCompania());
  const [demo, setDemoState] = useState<boolean>(getDemo());
  // Cambiar país resetea la compañía (los IDCOMPANIA son por país). `demo` recarga los hooks.
  const cambiarPais = (p: Pais) => { setPais(p); setPaisState(p); setCompania(''); setCompanyState(''); };
  const cambiarCompania = (c: string) => { setCompania(c); setCompanyState(c); };
  const cambiarDemo = (v: boolean) => { setDemo(v); setDemoState(v); };
  const companias = useCompanias(appUser, pais, demo);
  const { rutas, vehiculos, transportistas, conductores, loading } = useCatalogos(appUser, pais, demo);
  const { viajes, cargandoViajes } = useViajes(appUser, pais, company, demo);
  // Opción B: con compañía, las rutas mostradas se derivan de sus viajes (distribution_routes no la tiene).
  const rutasVisibles = company ? rutas.filter((r) => viajes.some((v) => v.route_type_id === r.id)) : rutas;
  const {
    viajeId, pedidosRuta, pedidosSeleccionados, excluidosPorCapacidad, optimizando, cargandoPedidos,
    setViaje, togglePedido, quitarPedido, reordenarParadas, optimizarRuta, resetPedidos,
    agregarDevolucionEnVivo,
  } = usePedidosRuta();
  const { anclados, toggleAnclaConValidacion, limpiarAnclas } = usePedidosAnclados();
  const { generarRuta, generando } = useGenerarRuta({ appUser, vehiculos, rutas });
  const { rutas: rutasGeneradas, refresh: refreshRutasGeneradas, eliminar: eliminarRutaGenerada, actualizar: actualizarRutaGenerada, cambiarEstado: cambiarEstadoRutaGenerada, eliminarVarias: eliminarRutasGeneradas, cambiarEstadoVarias: cambiarEstadoRutasGeneradas } = useRutasGeneradas();
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
    setVehiculoId(''); // el vehículo pertenece al transportista; limpiar al cambiarlo
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
      <PlanificacionHeader
        pais={pais}
        onPais={cambiarPais}
        companias={companias}
        company={company}
        onCompania={cambiarCompania}
        demo={demo} onDemo={cambiarDemo}
        resumen={tab === 'nueva' && pedidosSeleccionados.length > 0 ? { incluidos: pedidosSeleccionados.length, total: pedidosRuta.length } : null}
      />

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
          onEliminarVarias={eliminarRutasGeneradas}
          onCambiarEstadoVarias={cambiarEstadoRutasGeneradas}
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

      {tab === 'matriz' && <MatrizRutasTab pais={pais} />}
      {tab === 'asignar' && <AsignarViajesTab pais={pais} rutas={rutasVisibles} />}
      {tab === 'maestros' && <MaestrosTab transportistas={transportistas} conductores={conductores} vehiculos={vehiculos} />}

      {tab === 'flota' && (
        <FlotaSplitTab
          rutas={rutasVisibles}
          vehiculos={vehiculos}
          conductores={conductores}
          viajes={viajes}
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
          cargandoPedidos={cargandoViajes || cargandoPedidos}
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
