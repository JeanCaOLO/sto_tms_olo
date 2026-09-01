// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePedidosRuta } from './use-pedidos-ruta';
import type { Viaje } from './types';

const viaje: Viaje = {
  id: 'VJ-1', trip_number: 'V1', route_type_id: 'r', route_type_name: 'R',
  trip_date: '2026-01-01', status: 'despachado',
  pedidos: [
    { id: 'p1', order_number: 'ORD-1', customer_id: 'c', store_id: 's', delivery_address: 'x',
      delivery_city: 'SJ', delivery_zone: 'GAM', total_weight: 100, total_volume: 1,
      status: 'pending', order_date: '2026-01-01' },
  ],
};

describe('usePedidosRuta — devolución en vivo', () => {
  it('agregarDevolucionEnVivo la añade al final de la secuencia con stop_number', () => {
    const { result } = renderHook(() => usePedidosRuta());
    act(() => result.current.setViaje(viaje));
    act(() => result.current.agregarDevolucionEnVivo({ ref: 'Sitio X', peso: 20, volumen: 0.5 }));

    const seq = result.current.pedidosSeleccionados;
    expect(seq).toHaveLength(2);
    expect(seq[1].is_live).toBe(true);
    expect(seq[1].stop_number).toBe(2);
  });

  it('quitarPedido elimina la devolución en vivo de la secuencia y del pool', () => {
    const { result } = renderHook(() => usePedidosRuta());
    act(() => result.current.setViaje(viaje));
    act(() => result.current.agregarDevolucionEnVivo({ ref: 'Sitio X', peso: 20, volumen: 0.5 }));
    const liveId = result.current.pedidosSeleccionados[1].id;
    act(() => result.current.quitarPedido(liveId));

    expect(result.current.pedidosSeleccionados).toHaveLength(1);
    expect(result.current.pedidosRuta.some((p) => p.id === liveId)).toBe(false);
  });
});
