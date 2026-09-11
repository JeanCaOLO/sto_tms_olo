import { describe, it, expect, vi, afterEach } from 'vitest';
import { obtenerGeometriaRutaPorLeg } from './route-geometry';

const paradas = [
  { delivery_latitude: 9.93, delivery_longitude: -84.08, stop_number: 1 },
  { delivery_latitude: 9.95, delivery_longitude: -84.10, stop_number: 2 },
  { delivery_latitude: 9.97, delivery_longitude: -84.12, stop_number: 3 },
];

afterEach(() => vi.restoreAllMocks());

describe('obtenerGeometriaRutaPorLeg', () => {
  it('devuelve N-1 legs para N paradas usando la geometría de OSRM', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        routes: [{
          legs: [
            { steps: [{ geometry: { coordinates: [[-84.08, 9.93], [-84.09, 9.94], [-84.10, 9.95]] } }] },
            { steps: [{ geometry: { coordinates: [[-84.10, 9.95], [-84.12, 9.97]] } }] },
          ],
        }],
      }),
    })));

    const legs = await obtenerGeometriaRutaPorLeg(paradas);
    expect(legs).toHaveLength(2);
    expect(legs[0].fromStopNumber).toBe(1);
    expect(legs[0].toStopNumber).toBe(2);
    expect(legs[1].fromStopNumber).toBe(2);
    expect(legs[1].toStopNumber).toBe(3);
    // [lng,lat] -> [lat,lng]
    expect(legs[0].coords[0]).toEqual([9.93, -84.08]);
    expect(legs[0].coords).toHaveLength(3);
  });

  it('fallback: si OSRM falla devuelve un segmento recto por par consecutivo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const legs = await obtenerGeometriaRutaPorLeg(paradas);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toEqual({
      coords: [[9.93, -84.08], [9.95, -84.10]],
      fromStopNumber: 1,
      toStopNumber: 2,
    });
    expect(legs[1].fromStopNumber).toBe(2);
    expect(legs[1].toStopNumber).toBe(3);
  });

  it('fallback: OSRM responde con nº de legs inconsistente => rectos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ legs: [{ steps: [] }] }] }), // 1 leg, se esperan 2
    })));
    const legs = await obtenerGeometriaRutaPorLeg(paradas);
    expect(legs).toHaveLength(2);
    expect(legs[0].coords).toHaveLength(2); // recto
  });

  it('menos de 2 paradas => sin legs', async () => {
    expect(await obtenerGeometriaRutaPorLeg([paradas[0]])).toEqual([]);
  });
});
