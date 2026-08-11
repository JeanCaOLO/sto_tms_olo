import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import PedidosRuta from './components/PedidosRuta';
import RutaEnConstruccion from './components/RutaEnConstruccion';
import ConfiguracionRuta from './components/ConfiguracionRuta';
import { useCatalogos } from './use-catalogos';
import { usePedidosRuta } from './use-pedidos-ruta';
import { useGenerarRuta } from './use-generar-ruta';

export default function PlanificacionPage() {
  const { appUser } = useAuth();
  const { rutas, vehiculos, transportistas, conductores, loading } = useCatalogos(appUser);
  const {
    rutaTypeId, pedidosRuta, pedidosSeleccionados, cargandoPedidos,
    setRutaTypeId, togglePedido, quitarPedido, reordenarParadas, optimizarRuta, resetPedidos,
  } = usePedidosRuta(appUser);
  const { generarRuta, generando } = useGenerarRuta({ appUser, vehiculos, rutas });

  const [transportistaId, setTransportistaId] = useState('');
  const [conductorId, setConductorId] = useState('');
  const [vehiculoId, setVehiculoId] = useState('');
  const [fechaRuta, setFechaRuta] = useState(new Date().toISOString().split('T')[0]);

  const handleSetTransportistaId = (value: string) => {
    setTransportistaId(value);
    setConductorId('');
  };

  const handleGenerarRuta = () => {
    generarRuta({ pedidosSeleccionados, rutaTypeId, conductorId, vehiculoId, fechaRuta }, () => {
      resetPedidos();
      setTransportistaId('');
      setConductorId('');
      setVehiculoId('');
      setFechaRuta(new Date().toISOString().split('T')[0]);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Planificación de Rutas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Selecciona una ruta del catálogo, asigna transportista, conductor y vehículo, y genera la ruta óptima de entrega
          </p>
        </div>
        {pedidosSeleccionados.length > 0 && (
          <div className="flex items-center gap-2 text-sm bg-teal-50 border border-teal-200 text-teal-700 px-3 py-2 rounded-lg">
            <i className="ri-checkbox-circle-line"></i>
            <span><strong>{pedidosSeleccionados.length}</strong> de <strong>{pedidosRuta.length}</strong> pedidos incluidos</span>
          </div>
        )}
      </div>

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
        onOptimizarRuta={optimizarRuta}
        generando={generando}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PedidosRuta
          rutaNombre={rutaNombre}
          pedidos={pedidosRuta}
          pedidosIncluidos={pedidosSeleccionados.map((p) => p.id)}
          onTogglePedido={togglePedido}
          rutaSeleccionada={!!rutaTypeId}
          cargandoPedidos={cargandoPedidos}
        />

        <RutaEnConstruccion
          pedidosSeleccionados={pedidosSeleccionados}
          onQuitarPedido={quitarPedido}
          onReordenarParadas={reordenarParadas}
        />
      </div>
    </div>
  );
}
