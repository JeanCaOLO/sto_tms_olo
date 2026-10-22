import { describe, expect, it } from 'vitest';
import { detectStops, pointAt, validTrail, type TrailPoint } from '../replay-logic';

const at = (min: number) => new Date(Date.parse('2026-10-16T12:00:00Z') + min * 60_000).toISOString();
const trail: TrailPoint[] = [
  { lat: 9.9, lng: -84.0, at: at(0) },
  { lat: 9.9, lng: -83.9, at: at(10) },
  { lat: 9.9, lng: -83.8, at: at(20) },
];

describe('replay-logic', () => {
  it('interpola la posición por tiempo y limita el progreso a 0..1', () => {
    expect(pointAt(trail, 0)).toMatchObject({ lat: 9.9, lng: -84.0, index: 0 });
    expect(pointAt(trail, 0.25)?.lng).toBeCloseTo(-83.95, 5);
    expect(pointAt(trail, 0.75)).toMatchObject({ index: 1 });
    expect(pointAt(trail, 5)?.lng).toBeCloseTo(-83.8, 5);
    expect(pointAt(trail, -1)?.lng).toBeCloseTo(-84.0, 5);
  });

  it('no hay replay con menos de 2 puntos', () => {
    expect(pointAt([], 0.5)).toBeNull();
    expect(pointAt([trail[0]], 0.5)).toBeNull();
  });

  it('descarta fechas inválidas y ordena cronológicamente', () => {
    const sorted = validTrail([trail[2], { lat: 0, lng: 0, at: 'x' }, trail[0]]);
    expect(sorted.map((p) => p.at)).toEqual([trail[0].at, trail[2].at]);
  });

  it('detecta paradas de al menos 3 min dentro de 100 m y no las breves', () => {
    const parked: TrailPoint[] = [
      { lat: 9.9, lng: -84.0, at: at(0) },
      { lat: 9.9001, lng: -84.0, at: at(2) },
      { lat: 9.9001, lng: -84.0001, at: at(6) },
      { lat: 9.95, lng: -84.0, at: at(10) },
      { lat: 9.9501, lng: -84.0, at: at(11) },
    ];
    const stops = detectStops(parked);
    expect(stops).toHaveLength(1);
    expect(stops[0].toMs - stops[0].fromMs).toBe(6 * 60_000);
    expect(detectStops(trail)).toEqual([]);
  });
});
