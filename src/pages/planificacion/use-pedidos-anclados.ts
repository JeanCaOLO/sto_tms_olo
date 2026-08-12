import { useState } from 'react';

export function usePedidosAnclados() {
  const [anclados, setAnclados] = useState<Set<string>>(new Set());

  const toggleAncla = (pedidoId: string) => {
    setAnclados((prev) => {
      const next = new Set(prev);
      if (next.has(pedidoId)) next.delete(pedidoId);
      else next.add(pedidoId);
      return next;
    });
  };

  const limpiarAnclas = () => setAnclados(new Set());

  return { anclados, toggleAncla, limpiarAnclas };
}
