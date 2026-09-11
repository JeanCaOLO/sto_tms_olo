import { useState } from 'react';
import { optimizarConCapacidad } from './capacity-fit';
import { construirMatrizDistancias } from './distance-matrix';
import { withStopNumbers } from './optimize-stops';
import { conAnclasEnVivo, crearDevolucionEnVivo, type DevolucionEnVivoInput } from './live-devolucion';
import { fetchPedidosDeViaje } from './eflow-api';
import type { Pedido, PedidoSeleccionado, Vehiculo, Viaje } from './types';

export function usePedidosRuta() {
  const [viajeId, setViajeIdState] = useState('');
  const [pedidosRuta, setPedidosRuta] = useState<Pedido[]>([]);
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<PedidoSeleccionado[]>([]);
  const [excluidosPorCapacidad, setExcluidosPorCapacidad] = useState<PedidoSeleccionado[]>([]);
  const [optimizando, setOptimizando] = useState(false);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);

  const aplicarPedidos = (pedidos: Pedido[]) => {
    setPedidosRuta(pedidos);
    setPedidosSeleccionados(withStopNumbers(pedidos));
    setExcluidosPorCapacidad([]);
  };

  // Al elegir el viaje se cargan sus pedidos asignados. Si el viaje ya los trae
  // (precargados) se usan directo; si no, se cargan perezoso desde
  // journey_orders. Sin viaje, limpia el panel.
  const setViaje = async (viaje?: Viaje) => {
    setViajeIdState(viaje?.id || '');
    if (!viaje) {
      aplicarPedidos([]);
      return;
    }
    if (viaje.pedidos && viaje.pedidos.length > 0) {
      aplicarPedidos(viaje.pedidos);
      return;
    }
    setCargandoPedidos(true);
    try {
      aplicarPedidos(await fetchPedidosDeViaje(viaje.id, viaje.route_type_id));
    } catch (error) {
      console.error('Error cargando pedidos del viaje:', error);
      aplicarPedidos([]);
    } finally {
      setCargandoPedidos(false);
    }
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
    // Una devolución en vivo no vive en el pool del viaje: quitarla del
    // secuenciador la elimina del todo.
    setPedidosRuta((prev) => prev.filter((p) => p.id !== pedidoId));
  };

  const agregarDevolucionEnVivo = (input: DevolucionEnVivoInput) => {
    const nueva = crearDevolucionEnVivo(input);
    setPedidosRuta((prev) => [...prev, nueva]);
    setPedidosSeleccionados((prev) => withStopNumbers([...prev, nueva]));
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
      const anclasConLive = conAnclasEnVivo(pedidosRuta, anclados);
      const { orden, excluidos } = optimizarConCapacidad(withStopNumbers(pedidosRuta), vehiculo, anclasConLive, matriz);
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
    viajeId, pedidosRuta, pedidosSeleccionados, excluidosPorCapacidad, optimizando, cargandoPedidos,
    setViaje, togglePedido, quitarPedido, reordenarParadas, optimizarRuta, resetPedidos,
    agregarDevolucionEnVivo,
  };
}
