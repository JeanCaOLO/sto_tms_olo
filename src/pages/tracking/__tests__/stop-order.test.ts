import { describe, expect, it } from 'vitest';
import { ordenarPorSecuencia } from '../stop-order';
import type { Stop } from '../types';

const stop = (id: string, sequence: number, over: Partial<Stop> = {}) => ({ id, sequence, lat: 9.9, lng: -84, state: 'pending', ...over }) as Stop;
const ids = (stops: Stop[]) => stops.map((s) => s.id);

describe('ordenarPorSecuencia', () => {
  it('respeta la secuencia de Planificación aunque una parada lejana vaya primero', () => {
    const far = stop('lejos', 1, { lat: 10.5, lng: -83 });
    const near = stop('cerca', 2);
    expect(ids(ordenarPorSecuencia([near, far]))).toEqual(['lejos', 'cerca']);
  });

  it('deja las entregadas en su lugar de la secuencia, no las agrupa al principio', () => {
    const list = [stop('c', 3, { state: 'delivered' }), stop('a', 1), stop('b', 2, { state: 'failed' })];
    expect(ids(ordenarPorSecuencia(list))).toEqual(['a', 'b', 'c']);
  });

  it('no muta la lista original y acepta una lista vacía', () => {
    const list = [stop('b', 2), stop('a', 1)];
    ordenarPorSecuencia(list);
    expect(ids(list)).toEqual(['b', 'a']);
    expect(ordenarPorSecuencia([])).toEqual([]);
  });
});
