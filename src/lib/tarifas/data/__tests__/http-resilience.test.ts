// Cliente HTTP: lecturas agrupadas (/batch), consultas largas por POST (/find), reintentos de lecturas
// y tiempo máximo por llamada. Contra un `fetch` simulado: sin red.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpDataSource, resetHttpFeatureFlags } from '../http-datasource';
import { diffMetrics, getTarifasMetrics } from '../metrics';
import { findMany } from '../datasource';

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const source = (fetchImpl: unknown, extra = {}) =>
  new HttpDataSource({ baseUrl: 'https://api/api', fetchImpl: fetchImpl as typeof fetch, retryDelayMs: 0, ...extra });

const callOf = (fetchImpl: ReturnType<typeof vi.fn>, n: number) => {
  const [url, init] = fetchImpl.mock.calls[n] as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

beforeEach(() => resetHttpFeatureFlags());

describe('findMany / batch', () => {
  it('varias lecturas viajan en UNA llamada POST /tarifas/batch', async () => {
    const fetchImpl = vi.fn(async () => json(200, [[{ id: 'r1' }], [{ id: 'g1' }, { id: 'g2' }]]));
    const ds = source(fetchImpl);
    const antes = getTarifasMetrics();

    const [rules, groups] = await findMany(ds, [
      { entity: 'pricingRule', options: { where: [{ column: 'country_id', op: 'eq', value: 'c1' }] } },
      { entity: 'zoneGroup' },
    ]);

    expect(rules).toEqual([{ id: 'r1' }]);
    expect(groups).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, init, body } = callOf(fetchImpl, 0);
    expect(url).toBe('https://api/api/tarifas/batch');
    expect(init.method).toBe('POST');
    expect(body.queries).toEqual([
      { table: 'tarifas_pricing_rules', q: { where: [{ column: 'country_id', op: 'eq', value: 'c1' }] } },
      { table: 'tarifas_zone_groups', q: {} },
    ]);
    const delta = diffMetrics(antes, getTarifasMetrics());
    expect(delta.requests).toBe(1);
    expect(delta.batches).toBe(1);
    expect(delta.savedByBatch).toBe(1);
  });

  it('una sola lectura no usa /batch', async () => {
    const fetchImpl = vi.fn(async () => json(200, [{ id: 'x' }]));
    await findMany(source(fetchImpl), [{ entity: 'zoneGroup' }]);
    expect(callOf(fetchImpl, 0).url).toContain('/tarifas/tarifas_zone_groups');
  });

  it('más de 25 lecturas se parten en varias llamadas, en orden', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const n = JSON.parse(String(init.body)).queries.length;
      return json(200, Array.from({ length: n }, () => []));
    });
    const out = await findMany(source(fetchImpl), Array.from({ length: 30 }, () => ({ entity: 'zoneGroup' as const })));
    expect(out).toHaveLength(30);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('si el backend desplegado todavía no tiene /batch (404) vuelve a lecturas sueltas y lo recuerda', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/batch') ? json(404, { message: 'Not Found' }) : json(200, [{ id: 'x' }]));
    const ds = source(fetchImpl);

    const first = await findMany(ds, [{ entity: 'zoneGroup' }, { entity: 'zone' }]);
    expect(first).toEqual([[{ id: 'x' }], [{ id: 'x' }]]);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // /batch (404) + 2 sueltas

    fetchImpl.mockClear();
    await findMany(ds, [{ entity: 'zoneGroup' }, { entity: 'zone' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // ya no insiste con /batch
  });
});

describe('consultas largas', () => {
  const ids = Array.from({ length: 800 }, (_, n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);

  it('una consulta que no cabe en la URL va por POST /find con q en el cuerpo', async () => {
    const fetchImpl = vi.fn(async () => json(200, [{ id: 's1' }]));
    const options = { where: [{ column: 'trip_id', op: 'in' as const, value: ids }] };
    expect(await source(fetchImpl).find('settlement', options)).toEqual([{ id: 's1' }]);
    const { url, init, body } = callOf(fetchImpl, 0);
    expect(url).toBe('https://api/api/tarifas/tarifas_settlements/find');
    expect(init.method).toBe('POST');
    expect(body).toEqual(options);
  });

  it('una consulta corta sigue yendo por GET', async () => {
    const fetchImpl = vi.fn(async () => json(200, []));
    await source(fetchImpl).find('settlement', { where: [{ column: 'status', op: 'eq', value: 'Borrador' }] });
    expect(callOf(fetchImpl, 0).init.method).toBe('GET');
  });

  it('sin /find en el backend (404) cae a GET', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === 'POST' ? json(404, { message: 'Not Found' }) : json(200, [{ id: 'ok' }]));
    const rows = await source(fetchImpl).find('settlement', { where: [{ column: 'trip_id', op: 'in', value: ids }] });
    expect(rows).toEqual([{ id: 'ok' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('reintentos y tiempo máximo', () => {
  it('una lectura se reintenta ante 503 y termina bien', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(503, { error: 'frío' }))
      .mockResolvedValueOnce(json(200, [{ id: 'a' }]));
    const antes = getTarifasMetrics();
    expect(await source(fetchImpl).find('zoneGroup')).toEqual([{ id: 'a' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(diffMetrics(antes, getTarifasMetrics()).retries).toBe(1);
  });

  it('una lectura se reintenta ante un corte de red', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(200, []));
    await source(fetchImpl).find('zoneGroup');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('agota los reintentos y devuelve el último error', async () => {
    const fetchImpl = vi.fn(async () => json(503, { error: { message: 'sin servicio' } }));
    await expect(source(fetchImpl, { retries: 2 }).find('zoneGroup')).rejects.toThrow('sin servicio');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('un 4xx no se reintenta', async () => {
    const fetchImpl = vi.fn(async () => json(400, { error: 'mal pedido' }));
    await expect(source(fetchImpl).find('zoneGroup')).rejects.toThrow('mal pedido');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('una ESCRITURA nunca se reintenta (podría duplicarse)', async () => {
    const fetchImpl = vi.fn(async () => json(503, { error: 'x' }));
    await expect(source(fetchImpl).insert('settlement', { id: 'a' })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    fetchImpl.mockClear();
    await expect(source(fetchImpl).transaction(async (tx) => { await tx.insert('settlement', { id: 'a' }); })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('una llamada que no responde se corta por tiempo y se informa', async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const antes = getTarifasMetrics();
    await expect(source(fetchImpl, { timeoutMs: 20, retries: 0 }).find('zoneGroup')).rejects.toThrow('no respondió');
    expect(diffMetrics(antes, getTarifasMetrics()).timeouts).toBe(1);
  });
});
