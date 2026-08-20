import { useState } from 'react';
import { useToast } from '../../hooks/useToast';
import { excedeCapacidadAlAnclar } from './capacity-fit';
import type { Pedido, PedidoSeleccionado, Vehiculo } from './types';

export function usePedidosAnclados() {
  const [anclados, setAnclados] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  const toggleAncla = (pedidoId: string) => {
    setAnclados((prev) => {
      const next = new Set(prev);
      if (next.has(pedidoId)) next.delete(pedidoId);
      else next.add(pedidoId);
      return next;
    });
  };

  const limpiarAnclas = () => setAnclados(new Set());

  // Valida capacidad antes de anclar — no dejar anclar un pedido que ya por
  // sí solo (sumado a lo ya anclado) exceda el margen de seguridad.
  const toggleAnclaConValidacion = (pedido: Pedido, vehiculo: Vehiculo | undefined, pedidosSeleccionados: PedidoSeleccionado[]) => {
    const yaAnclado = anclados.has(pedido.id);
    if (!yaAnclado && vehiculo) {
      const excede = excedeCapacidadAlAnclar({ ...pedido, stop_number: 0 }, anclados, pedidosSeleccionados, vehiculo);
      if (excede) {
        showToast('No se puede anclar: ya hay pedidos anclados que superan la capacidad de seguridad del vehículo.', 'warning');
        return;
      }
    }
    toggleAncla(pedido.id);
  };

  return { anclados, toggleAncla, limpiarAnclas, toggleAnclaConValidacion };
}
