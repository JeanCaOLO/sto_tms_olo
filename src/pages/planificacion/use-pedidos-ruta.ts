import { useState } from 'react';
import { optimizarConCapacidad } from './capacity-fit';
import { construirMatrizDistancias } from './distance-matrix';
import { withStopNumbers } from './optimize-stops';
import type { Pedido, PedidoSeleccionado, Vehiculo, Viaje } from './types';

export function usePedidosRuta() {
  const [viajeId, setViajeIdState] = useState('');
  const [pedidosRuta, setPedidosRuta] = useState<Pedido[]>([]);
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<PedidoSeleccionado[]>([]);
  const [excluidosPorCapacidad, setExcluidosPorCapacidad] = useState<PedidoSeleccionado[]>([]);
  const [optimizando, setOptimizando] = useState(false);

  const setViaje = (viaje?: Viaje) => {
    const pedidos = viaje?.pedidos || [];
    setViajeIdState(viaje?.id || '');
    setPedidosRuta(pedidos);
    setPedidosSeleccionados(withStopNumbers(pedidos));
    setExcluidosPorCapacidad([]);
  };

  const togglePedido = (pedido: Pedido) => {
    const incluido = pedidosSeleccionados.some((p) => p.id === pedido.id);
    const siguiente = incluido
      ? pedidosSeleccionados.filter((p) => p.id !== pedido.id)
      : [...pedidosSeleccionados, pedido];
    setPedidosSeleccionados(withStopNumbers(siguiente));
  };

  const quitarPedido = (pedidoId: string) => {
    setPedidosSeleccionados(withStopNumbers(pedidosSeleccionados.filter((p) => p.id !== pedidoId)));
  };

  const reordenarParadas = (fromIndex: number, toIndex: number) => {
    const nuevos = [...pedidosSeleccionados];
    const [removed] = nuevos.splice(fromIndex, 1);
    nuevos.splice(toIndex, 0, removed);
    setPedidosSeleccionados(withStopNumbers(nuevos));
  };

  // Optimiza sobre el pool completo del viaje (`pedidosRuta`), no solo lo
  // que haya quedado en `pedidosSeleccionados` — si el usuario ancló un
  // pedido y quitó el resto, aún así debe rellenar hasta la capacidad del
  // vehículo. La matriz N×N (OSRM real, con fallback haversine) se pide una
  // vez por click y se descarta después — viajes de este tamaño no
  // ameritan cachearla entre optimizaciones.
  const optimizarRuta = async (vehiculo?: Vehiculo, anclados?: Set<string>) => {
    if (pedidosRuta.length < 2) return;
    setOptimizando(true);
    try {
      const matriz = await construirMatrizDistancias(pedidosRuta);
      const { orden, excluidos } = optimizarConCapacidad(withStopNumbers(pedidosRuta), vehiculo, anclados, matriz);
      setPedidosSeleccionados(orden);
      setExcluidosPorCapacidad(excluidos);
      const fueraDeVentana = orden.filter((p) => p.outside_window).length;
      return { fuente: matriz.fuente, fueraDeVentana };
    } finally {
      setOptimizando(false);
    }
  };

  const resetPedidos = () => setViaje(undefined);

  return {
    viajeId, pedidosRuta, pedidosSeleccionados, excluidosPorCapacidad, optimizando,
    setViaje, togglePedido, quitarPedido, reordenarParadas, optimizarRuta, resetPedidos,
  };
}
