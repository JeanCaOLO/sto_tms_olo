import { useCallback, useEffect, useState } from 'react';
import { useOperationalContext } from '../../hooks/useOperationalContext';
import { fetchPedidosParaPlanificar } from './plan-pedidos-api';
import type { Pedido } from './types';

// Carga los pedidos planificables para la fecha seleccionada (selector de día).
// País/almacén/cliente salen del contexto operativo del headbar (van como
// headers), no de query. Re-consulta al cambiar la fecha O el contexto, así el
// tab se filtra en vivo sin recargar la página.
export function usePedidosDia(fecha: string) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedCountryId, selectedWarehouseId, selectedCustomerId } = useOperationalContext();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setPedidos(await fetchPedidosParaPlanificar(fecha));
    } catch (e) {
      setPedidos([]);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los pedidos.');
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar, selectedCountryId, selectedWarehouseId, selectedCustomerId]);

  return { pedidos, cargando, error, recargar: cargar };
}
