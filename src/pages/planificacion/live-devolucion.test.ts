import { describe, it, expect } from 'vitest';
import { crearDevolucionEnVivo, conAnclasEnVivo } from './live-devolucion';
import type { Pedido } from './types';

describe('live-devolucion', () => {
  it('crearDevolucionEnVivo marca tipo devolucion + is_live y sin coordenadas', () => {
    const p = crearDevolucionEnVivo({ ref: 'Farmacia La Paz', peso: 12, volumen: 0.3 });
    expect(p.tipo).toBe('devolucion');
    expect(p.is_live).toBe(true);
    expect(p.total_weight).toBe(12);
    expect(p.total_volume).toBe(0.3);
    expect(p.delivery_latitude).toBeUndefined();
    expect(p.id.startsWith('live-')).toBe(true);
  });

  it('conAnclasEnVivo une anclas del usuario con los ids de devoluciones en vivo', () => {
    const pedidos = [
      { id: 'a', is_live: false } as Pedido,
      { id: 'live-1', is_live: true } as Pedido,
    ];
    const set = conAnclasEnVivo(pedidos, new Set(['a']));
    expect(set.has('a')).toBe(true);
    expect(set.has('live-1')).toBe(true);
  });
});
