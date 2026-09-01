import PedidosRuta from './PedidosRuta';
import RutaEnConstruccion from './RutaEnConstruccion';
import ConfiguracionRuta from './ConfiguracionRuta';
import type { Conductor, Pedido, PedidoSeleccionado, Transportista, Vehiculo, Viaje } from '../types';

interface Props {
  viajes: Viaje[];
  vehiculos: Vehiculo[];
  transportistas: Transportista[];
  conductores: Conductor[];
  viajeId: string;
  rutaNombre: string;
  transportistaId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
  setViajeId: (value: string) => void;
  setTransportistaId: (value: string) => void;
  setConductorId: (value: string) => void;
  setVehiculoId: (value: string) => void;
  setFechaRuta: (value: string) => void;
  vehiculoSeleccionado?: Vehiculo;
  pedidosRuta: Pedido[];
  pedidosSeleccionados: PedidoSeleccionado[];
  pedidosAnclados: Set<string>;
  cargandoPedidos: boolean;
  excluidosPorCapacidad: PedidoSeleccionado[];
  generando: boolean;
  optimizando: boolean;
  onTogglePedido: (pedido: Pedido) => void;
  onToggleAncla: (pedido: Pedido) => void;
  onQuitarPedido: (pedidoId: string) => void;
  onReordenarParadas: (fromIndex: number, toIndex: number) => void;
  onGenerarRuta: () => void;
  onOptimizarRuta: () => void;
}

export default function NuevaRutaTab(props: Props) {
  const { excluidosPorCapacidad, pedidosSeleccionados } = props;
  const totalWeight = pedidosSeleccionados.reduce((s, p) => s + (p.total_weight || 0), 0);
  const totalVolume = pedidosSeleccionados.reduce((s, p) => s + (p.total_volume || 0), 0);

  // Subtotales de las devoluciones incluidas en la secuencia (BR1.2: cuentan
  // en la capacidad igual que una entrega). Se pasan a ConfiguracionRuta.
  const devoluciones = pedidosSeleccionados.filter((p) => p.tipo === 'devolucion');
  const devolucionesCount = devoluciones.length;
  const devolucionesPeso = devoluciones.reduce((s, p) => s + (p.total_weight || 0), 0);
  const devolucionesVolumen = devoluciones.reduce((s, p) => s + (p.total_volume || 0), 0);

  const totalExcluidos = excluidosPorCapacidad.length;
  const devsExcluidas = excluidosPorCapacidad.filter((p) => p.tipo === 'devolucion').length;
  const entregasExcluidas = totalExcluidos - devsExcluidas;
  const avisoExclusion =
    devsExcluidas === 0
      ? `${totalExcluidos} pedido(s) no cab${totalExcluidos === 1 ? 'e' : 'en'} en el vehículo (margen de seguridad: 85% peso / 95% volumen) y qued${totalExcluidos === 1 ? 'ó' : 'aron'} excluido${totalExcluidos === 1 ? '' : 's'} — reasígnalos a otro viaje.`
      : `${entregasExcluidas} pedido(s) de entrega y ${devsExcluidas} devolución/es no caben en el vehículo (margen de seguridad: 85% peso / 95% volumen) y quedaron excluidos — reasígnalos a otro viaje.`;

  return (
    <>
      <div role="status">
        {totalExcluidos > 0 && (
          <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg">
            <i className="ri-alert-line text-amber-600"></i>
            <span>{avisoExclusion}</span>
          </div>
        )}
      </div>

      <ConfiguracionRuta
        viajes={props.viajes}
        transportistas={props.transportistas}
        conductores={props.conductores}
        vehiculos={props.vehiculos}
        viajeId={props.viajeId}
        rutaNombre={props.rutaNombre}
        transportistaId={props.transportistaId}
        conductorId={props.conductorId}
        vehiculoId={props.vehiculoId}
        fechaRuta={props.fechaRuta}
        setViajeId={props.setViajeId}
        setTransportistaId={props.setTransportistaId}
        setConductorId={props.setConductorId}
        setVehiculoId={props.setVehiculoId}
        setFechaRuta={props.setFechaRuta}
        vehiculoSeleccionado={props.vehiculoSeleccionado}
        totalWeight={totalWeight}
        totalVolume={totalVolume}
        pedidosCount={pedidosSeleccionados.length}
        devolucionesCount={devolucionesCount}
        devolucionesPeso={devolucionesPeso}
        devolucionesVolumen={devolucionesVolumen}
        onGenerarRuta={props.onGenerarRuta}
        onOptimizarRuta={props.onOptimizarRuta}
        generando={props.generando}
        optimizando={props.optimizando}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PedidosRuta
          rutaNombre={props.rutaNombre}
          pedidos={props.pedidosRuta}
          pedidosIncluidos={pedidosSeleccionados.map((p) => p.id)}
          pedidosAnclados={props.pedidosAnclados}
          onTogglePedido={props.onTogglePedido}
          onToggleAncla={props.onToggleAncla}
          rutaSeleccionada={!!props.viajeId}
          cargandoPedidos={props.cargandoPedidos}
        />

        <RutaEnConstruccion
          pedidosSeleccionados={pedidosSeleccionados}
          onQuitarPedido={props.onQuitarPedido}
          onReordenarParadas={props.onReordenarParadas}
        />
      </div>
    </>
  );
}
