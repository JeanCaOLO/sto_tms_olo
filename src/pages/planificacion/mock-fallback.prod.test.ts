import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchConductores, fetchPedidosDeViaje, fetchTransportistas } from './eflow-api';
import { fetchPedidosParaPlanificar } from './plan-pedidos-api';
import { getFallbackPedidosParaPlanificar } from './fallback-pedidos';
import { FALLBACK_CONDUCTORES, FALLBACK_TRANSPORTISTAS } from './fallback-catalogos';
import { mockFallbackEnabled } from './mock-fallback';

const ok = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
const failing = () => vi.fn(async () => { throw new Error('network down'); });
const http502 = () => vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sin datos de ejemplo en producción (DEV=false)', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('mockFallbackEnabled es false', () => {
    expect(mockFallbackEnabled()).toBe(false);
  });

  it('pedidos a planificar: lanza si el backend no responde', async () => {
    vi.stubGlobal('fetch', failing());
    await expect(fetchPedidosParaPlanificar('2026-11-01')).rejects.toThrow(/No se pudo conectar/);
  });

  it('pedidos a planificar: lanza con HTTP no ok y menciona el status', async () => {
    vi.stubGlobal('fetch', http502());
    await expect(fetchPedidosParaPlanificar('2026-11-01')).rejects.toThrow(/HTTP 502/);
  });

  it('pedidos a planificar: lanza si la respuesta no es una lista', async () => {
    vi.stubGlobal('fetch', ok({ data: null }));
    await expect(fetchPedidosParaPlanificar('2026-11-01')).rejects.toThrow(/No se pudieron cargar/);
  });

  it('pedidos a planificar: un día real sin pedidos devuelve [] y no mock', async () => {
    vi.stubGlobal('fetch', ok({ data: [] }));
    expect(await fetchPedidosParaPlanificar('2026-11-01')).toEqual([]);
  });

  it('pedidos de un viaje: lanza si /api falla', async () => {
    vi.stubGlobal('fetch', failing());
    await expect(fetchPedidosDeViaje('1', 'eflow-rt-01')).rejects.toThrow('network down');
  });

  it('pedidos de un viaje: sin filas reales devuelve [] y no mock', async () => {
    vi.stubGlobal('fetch', ok([]));
    expect(await fetchPedidosDeViaje('1', 'eflow-rt-01')).toEqual([]);
  });

  it('catálogos: lanzan si /api falla', async () => {
    vi.stubGlobal('fetch', http502());
    await expect(fetchConductores(FALLBACK_CONDUCTORES)).rejects.toThrow(/HTTP 502/);
  });

  it('catálogos: una lista vacía real devuelve [] y no el ejemplo', async () => {
    vi.stubGlobal('fetch', ok([]));
    expect(await fetchTransportistas(FALLBACK_TRANSPORTISTAS)).toEqual([]);
  });
});

describe('con datos de ejemplo en desarrollo (DEV=true)', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('pedidos a planificar cae al ejemplo si el backend falla', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', failing());
      expect(await fetchPedidosParaPlanificar('2026-11-01')).toEqual(getFallbackPedidosParaPlanificar('2026-11-01'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('catálogos caen al ejemplo si /api falla', async () => {
    vi.stubGlobal('fetch', failing());
    expect(await fetchConductores(FALLBACK_CONDUCTORES)).toBe(FALLBACK_CONDUCTORES);
  });
});
