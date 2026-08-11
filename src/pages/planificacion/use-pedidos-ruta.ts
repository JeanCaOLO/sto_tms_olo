import { useCallback, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { optimizarParadas, withStopNumbers } from './optimize-stops';
import { fetchPedidosDeRuta } from './pedidos-api';
import type { Pedido, PedidoSeleccionado } from './types';

export function usePedidosRuta(appUser: AppUser | null) {
  const [rutaTypeId, setRutaTypeIdState] = useState('');
  const [pedidosRuta, setPedidosRuta] = useState<Pedido[]>([]);
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<PedidoSeleccionado[]>([]);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);

  const cargarPedidosDeRuta = useCallback(async (rtId: string) => {
    if (!rtId || !appUser) {
      setPedidosRuta([]);
      setPedidosSeleccionados([]);
      return;
    }
    try {
      setCargandoPedidos(true);
      const pedidos = await fetchPedidosDeRuta(appUser, rtId);
      setPedidosRuta(pedidos);
      setPedidosSeleccionados(withStopNumbers(pedidos));
    } catch (error) {
      console.error('Error cargando pedidos de la ruta:', error);
    } finally {
      setCargandoPedidos(false);
    }
  }, [appUser]);

  const setRutaTypeId = (value: string) => {
    setRutaTypeIdState(value);
    cargarPedidosDeRuta(value);
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

  const optimizarRuta = () => {
    if (pedidosSeleccionados.length < 2) return;
    setPedidosSeleccionados(withStopNumbers(optimizarParadas(pedidosSeleccionados)));
  };

  const resetPedidos = () => {
    setRutaTypeIdState('');
    setPedidosRuta([]);
    setPedidosSeleccionados([]);
  };

  return {
    rutaTypeId, pedidosRuta, pedidosSeleccionados, cargandoPedidos,
    setRutaTypeId, togglePedido, quitarPedido, reordenarParadas, optimizarRuta, resetPedidos,
  };
}
