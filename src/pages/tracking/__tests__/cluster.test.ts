import { describe, expect, it } from 'vitest';
import { clusterPoints } from '../components/map/cluster';

describe('clusterPoints', () => {
  it('no agrupa camiones separados en pantalla', () => {
    const points = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }, { id: 'c', x: 0, y: 100 }];
    expect(clusterPoints(points, 36).map((c) => c.ids)).toEqual([['a'], ['b'], ['c']]);
  });

  it('junta los que se encimarían y centra la burbuja en el promedio', () => {
    const points = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 20, y: 0 }, { id: 'c', x: 10, y: 30 }, { id: 'd', x: 300, y: 300 }];
    const clusters = clusterPoints(points, 36);
    expect(clusters.map((c) => c.ids)).toEqual([['a', 'b', 'c'], ['d']]);
    expect(clusters[0].x).toBeCloseTo(10);
    expect(clusters[0].y).toBeCloseTo(10);
  });

  it('el radio es inclusivo y una lista vacía no rompe', () => {
    expect(clusterPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 36, y: 0 }], 36)).toHaveLength(1);
    expect(clusterPoints([], 36)).toEqual([]);
  });
});
