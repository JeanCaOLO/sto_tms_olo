import { useCallback, useEffect, useState } from 'react';
import { fetchPedidosParaPlanificar } from './plan-pedidos-api';
import type { Pedido } from './types';

// Carga los pedidos planificables para la fecha seleccionada (selector de día).
// País/almacén salen del contexto operativo del headbar, no de query — el
// backend los toma del token/scope; el frontend solo pasa fecha_entrega.
export function usePedidosDia(fecha: string) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setPedidos(await fetchPedidosParaPlanificar(fecha));
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { pedidos, cargando, recargar: cargar };
}
