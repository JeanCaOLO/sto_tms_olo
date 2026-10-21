import { describe, expect, it } from 'vitest';
import { ordenarPorCercania } from '../stop-order';
import type { Stop } from '../types';

const stop = (sequence: number, lat: number | null, lng: number | null, state: Stop['state'] = 'pending', arrived_at: string | null = null) =>
  ({ id: `s${sequence}`, sequence, lat, lng, state, arrived_at }) as Stop;
const ids = (stops: Stop[]) => stops.map((s) => s.id);

describe('ordenarPorCercania', () => {
  const origin = { lat: 9.93, lng: -84.08, name: 'Sede' };
  const far = stop(1, 10.5, -84.5);
  const near = stop(2, 9.94, -84.08);
  const mid = stop(3, 10.0, -84.1);

  it('ordena las pendientes por vecino más cercano desde la sede', () => {
    expect(ids(ordenarPorCercania(origin, [far, near, mid]))).toEqual(['s2', 's3', 's1']);
  });

  it('sin sede parte de la primera parada de la secuencia', () => {
    expect(ids(ordenarPorCercania(null, [far, near, mid]))).toEqual(['s1', 's3', 's2']);
  });

  it('las cerradas van primero (por llegada) y las pendientes parten de la última cerrada', () => {
    const done = stop(4, 10.49, -84.49, 'delivered', '2026-10-19T10:00:00Z');
    const earlier = stop(5, 9.95, -84.07, 'failed', '2026-10-19T09:00:00Z');
    expect(ids(ordenarPorCercania(origin, [near, done, mid, earlier, far]))).toEqual(['s5', 's4', 's1', 's3', 's2']);
  });

  it('las paradas sin coordenadas van al final en su secuencia y no se pierde ninguna', () => {
    const lost = stop(6, null, null);
    const lost2 = stop(7, null, null);
    const result = ordenarPorCercania(origin, [lost2, far, lost, near]);
    expect(ids(result)).toEqual(['s2', 's1', 's6', 's7']);
    expect(ordenarPorCercania(null, [])).toEqual([]);
  });
});
