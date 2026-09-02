import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mapViaje, mapRuta, mapTransportista, mapConductor, mapVehiculo, capacidadSintetica,
  mapPedido, fetchViajes, fetchTransportistas, fetchPedidosPorViaje,
} from './eflow-api';
import { FALLBACK_TRANSPORTISTAS } from './fallback-catalogos';
import { getFallbackPedidos } from './fallback-pedidos';

afterEach(() => vi.restoreAllMocks());

describe('mapViaje', () => {
  const row = {
    trip_id: 8213, trip_status: 'PENDING', trip_created: '2026-07-14T16:47:41.337Z',
    trip_dispatch: null, route_codes: '11,13', route_name: 'GUANACASTE BAJURA', route_alias: 'ZONA SUR',
  };

  it('takes the first route code and builds a resolvable route_type_id', () => {
    const v = mapViaje(row);
    expect(v.id).toBe('8213');
    expect(v.route_type_id).toBe('eflow-rt-11');
    expect(v.route_type_name).toBe('GUANACASTE BAJURA');
    expect(v.trip_number).toBe('Viaje 8213 · GUANACASTE BAJURA');
    expect(v.status).toBe('despachado');
    expect(v.trip_date).toBe('2026-07-14');
  });

  it('falls back to trip_created when no dispatch date, and seeds synthetic stops', () => {
    const v = mapViaje(row);
    expect(v.trip_date).toBe('2026-07-14');
    expect(v.pedidos.length).toBeGreaterThan(0);
    expect(v.pedidos.every((p) => p.route_type_id === 'eflow-rt-11')).toBe(true);
  });

  it('handles a missing route name', () => {
    expect(mapViaje({ ...row, route_name: null, route_alias: null }).trip_number).toBe('Viaje 8213');
  });
});

describe('catalog mappers', () => {
  it('maps ruta with trimmed name and eflow id', () => {
    expect(mapRuta({ route_code: '05', route_name: ' HEREDIA', route_alias: null }))
      .toEqual({ id: 'eflow-rt-05', name: '05 · HEREDIA' });
  });

  it('links conductor.carrier_id to transportista.id', () => {
    const t = mapTransportista({ carrier_id: 3, company_name: 'Transportista A' });
    const c = mapConductor({ driver_id: 6, driver_name: 'CONDUCTOR A', driver_document: '000000000', carrier_id: 3 });
    expect(c.carrier_id).toBe(t.id);
    expect(t.id).toBe('eflow-car-3');
  });

  it('conductor with null carrier maps to empty carrier_id', () => {
    expect(mapConductor({ driver_id: 1, driver_name: 'X', driver_document: null, carrier_id: null }).carrier_id).toBe('');
  });

  it('vehiculo keeps synthetic capacity (QA reports 0) and reads model from unit_description', () => {
    const v = mapVehiculo({ vehicle_id: 14, license_plate: 'PLACA-001', vehicle_brand: 'NISSAN UD', unit_description: 'NISSAN UD', carrier_id: 3 });
    expect(v.id).toBe('eflow-veh-14');
    expect(v.capacity_weight).toBe(8000);
    expect(v.capacity_volume).toBe(32);
  });

  it('capacidadSintetica picks a bucket by brand', () => {
    expect(capacidadSintetica('KIA Bongo').capacity_weight).toBe(2500);
    expect(capacidadSintetica('Isuzu NPR').capacity_weight).toBe(4500);
    expect(capacidadSintetica('').capacity_weight).toBe(4500);
    expect(capacidadSintetica(null).capacity_weight).toBe(4500);
  });
});

describe('fetch + fallback', () => {
  it('fetchViajes maps the API payload and enriches pedidos per trip', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/pedidos')) {
        return { ok: true, json: async () => ([]) }; // no real order lines for this trip in QA
      }
      return {
        ok: true,
        json: async () => ([{
          trip_id: 1, trip_status: 'COMPLETED', trip_created: '2026-01-01T00:00:00Z',
          trip_dispatch: null, route_codes: '08', route_name: 'SAN CARLOS', route_alias: 'SAN CARLOS',
        }]),
      };
    }));
    const v = await fetchViajes();
    expect(v[0].route_type_id).toBe('eflow-rt-08');
    // 0 real rows -> falls back to the mock stops seeded by mapViaje
    expect(v[0].pedidos.length).toBeGreaterThan(0);
  });

  it('fetchTransportistas returns the fallback when the API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await fetchTransportistas(FALLBACK_TRANSPORTISTAS)).toBe(FALLBACK_TRANSPORTISTAS);
  });

  it('fetchTransportistas returns the fallback on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    expect(await fetchTransportistas(FALLBACK_TRANSPORTISTAS)).toBe(FALLBACK_TRANSPORTISTAS);
  });

  it('fetchTransportistas returns the fallback when the API is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ([]) })));
    expect(await fetchTransportistas(FALLBACK_TRANSPORTISTAS)).toBe(FALLBACK_TRANSPORTISTAS);
  });

  it('fetchPedidosPorViaje maps real order lines when present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ([{
        trip_id: 8007, order_number: 'EDI0112261', invoice_number: '00100001010000854213',
        customer_id: 'A7074', customer_name: 'ALMACENES EL COLONO S.A.',
        delivery_address: 'Prov:: PUNTARENAS\nCton:: GOLFITO', delivery_latitude: '8.53370870',
        delivery_longitude: '-83.30615300', route_code: '32', total_units: 6, total_amount: 11043.48,
      }]),
    })));
    const fallback = getFallbackPedidos('eflow-rt-32');
    const pedidos = await fetchPedidosPorViaje('8007', 'eflow-rt-32', fallback);
    expect(pedidos).not.toBe(fallback);
    expect(pedidos[0].order_number).toBe('EDI0112261');
    expect(pedidos[0].customer_name).toBe('ALMACENES EL COLONO S.A.');
    expect(pedidos[0].delivery_latitude).toBeCloseTo(8.5337);
    expect(pedidos[0].tipo).toBeUndefined(); // no real devolucion signal (doc #8)
  });

  it('fetchPedidosPorViaje falls back to the mock when the trip has 0 real rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ([]) })));
    const fallback = getFallbackPedidos('eflow-rt-01');
    expect(await fetchPedidosPorViaje('1', 'eflow-rt-01', fallback)).toBe(fallback);
  });

  it('fetchPedidosPorViaje falls back to the mock when /api is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const fallback = getFallbackPedidos('eflow-rt-01');
    expect(await fetchPedidosPorViaje('1', 'eflow-rt-01', fallback)).toBe(fallback);
  });
});

describe('mapPedido', () => {
  const row = {
    trip_id: 8007, order_number: 'EDI0112261', invoice_number: '00100001010000854213',
    customer_id: 'A7074', customer_name: 'ALMACENES EL COLONO S.A.',
    delivery_address: 'Prov:: PUNTARENAS', delivery_latitude: '8.53370870',
    delivery_longitude: '-83.30615300', route_code: '32', total_units: 6, total_amount: 11043.48,
  };

  it('maps a real order line to a Pedido', () => {
    const p = mapPedido(row, 'eflow-rt-32');
    expect(p.id).toBe('eflow-ped-8007-EDI0112261');
    expect(p.order_number).toBe('EDI0112261');
    expect(p.customer_name).toBe('ALMACENES EL COLONO S.A.');
    expect(p.delivery_latitude).toBeCloseTo(8.5337);
    expect(p.delivery_longitude).toBeCloseTo(-83.3062);
    expect(p.route_type_id).toBe('eflow-rt-32');
  });

  it('keeps the stop with null coords instead of dropping it (~71% of clients have no lat/lng)', () => {
    const p = mapPedido({ ...row, delivery_latitude: null, delivery_longitude: null }, 'eflow-rt-32');
    expect(p.delivery_latitude).toBeUndefined();
    expect(p.delivery_longitude).toBeUndefined();
    expect(p.order_number).toBe('EDI0112261');
  });
});

