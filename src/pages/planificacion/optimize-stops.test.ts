import { describe, it, expect } from 'vitest';
import { optimizarParadas, withStopNumbers } from './optimize-stops';
import type { Pedido } from './types';

function p(id: string, lat: number, lng: number, tipo?: 'entrega' | 'devolucion'): Pedido {
  return {
    id, order_number: id, customer_id: 'c', store_id: 's',
    delivery_address: 'x', delivery_city: 'San José', delivery_zone: 'GAM',
    total_weight: 100, total_volume: 1, status: 'pending', order_date: '2026-01-01',
    delivery_latitude: lat, delivery_longitude: lng, tipo,
  };
}

describe('optimize-stops — el tipo de parada no altera el orden (FR16, BR1.3 sólo pinta)', () => {
  const base = [
    p('A', 9.93, -84.08),
    p('B', 9.95, -84.10),
    p('C', 9.97, -84.12),
    p('D', 9.99, -84.14),
  ];

  it('mismo orden con y sin devoluciones marcadas', () => {
    const sinTipo = optimizarParadas(base).map((x) => x.id);
    const conDevolucion = optimizarParadas([
      p('A', 9.93, -84.08),
      p('B', 9.95, -84.10, 'devolucion'),
      p('C', 9.97, -84.12),
      p('D', 9.99, -84.14, 'devolucion'),
    ]).map((x) => x.id);
    expect(conDevolucion).toEqual(sinTipo);
  });

  it('la secuencia conserva todas las paradas de devolución', () => {
    const orden = withStopNumbers(optimizarParadas([
      p('A', 9.93, -84.08, 'devolucion'),
      p('B', 9.95, -84.10),
      p('C', 9.97, -84.12, 'devolucion'),
    ]));
    expect(orden.filter((x) => x.tipo === 'devolucion')).toHaveLength(2);
    expect(orden.map((x) => x.stop_number)).toEqual([1, 2, 3]);
  });
});
