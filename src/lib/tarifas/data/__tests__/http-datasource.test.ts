// Driver HTTP contra un `fetch` simulado: verifica el contrato con `backend/tarifas/` sin red.

import { describe, expect, it, vi } from 'vitest';
import { HttpDataSource } from '../http-datasource';
import { ForeignKeyError, ReadOnlyEntityError, UniqueViolationError } from '../datasource';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('HttpDataSource', () => {
  it('lee una entidad externa por la tabla/vista del registro, con el filtro en q', async () => {
    const fetchImpl = fakeFetch(200, [{ id: 'v1' }]);
    const ds = new HttpDataSource({ baseUrl: 'https://api/api/', fetchImpl, headers: () => ({ Authorization: 'Bearer T' }) });

    const rows = await ds.find('trip', { where: [{ column: 'status', op: 'eq', value: 'completed' }] });

    expect(rows).toEqual([{ id: 'v1' }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, NonNullable<Parameters<typeof fetch>[1]>];
    expect(url.startsWith('https://api/api/tarifas/tarifas_v_viajes?q=')).toBe(true);
    expect(JSON.parse(decodeURIComponent(url.split('?q=')[1]))).toEqual({
      where: [{ column: 'status', op: 'eq', value: 'completed' }],
    });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer T');
  });

  it('rechaza escribir una entidad externa sin llegar a la red', async () => {
    const fetchImpl = fakeFetch(200, {});
    const ds = new HttpDataSource({ baseUrl: 'https://api', fetchImpl });

    await expect(ds.insert('carrier', { name: 'x' })).rejects.toThrow(ReadOnlyEntityError);
    await expect(ds.update('trip', 'v1', { status: 'x' })).rejects.toThrow(ReadOnlyEntityError);
    await expect(ds.delete('driver', 'd1')).rejects.toThrow(ReadOnlyEntityError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('405 del backend se traduce a solo lectura', async () => {
    const ds = new HttpDataSource({ baseUrl: 'https://api', fetchImpl: fakeFetch(405, { error: 'read only' }) });
    await expect(ds.insert('settlement', {})).rejects.toThrow(ReadOnlyEntityError);
  });

  it('409 distingue FK (23503) de unicidad (23505)', async () => {
    const fk = new HttpDataSource({
      baseUrl: 'https://api',
      fetchImpl: fakeFetch(409, { error: 'en uso', code: '23503' }),
    });
    await expect(fk.delete('settlementParty', 'p1')).rejects.toThrow(ForeignKeyError);

    const uq = new HttpDataSource({
      baseUrl: 'https://api',
      fetchImpl: fakeFetch(409, { error: 'El viaje ya tiene una liquidación vigente.', code: '23505' }),
    });
    await expect(uq.insert('settlement', {})).rejects.toThrow(UniqueViolationError);
    await expect(uq.insert('settlement', {})).rejects.toThrow('liquidación vigente');
  });

  it('entiende la forma de error del backend: { data: null, error: { message, code } }', async () => {
    const uq = new HttpDataSource({
      baseUrl: 'https://api',
      fetchImpl: fakeFetch(409, { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }),
    });
    await expect(uq.insert('settlement', {})).rejects.toThrow(UniqueViolationError);

    const tx = new HttpDataSource({
      baseUrl: 'https://api',
      fetchImpl: fakeFetch(409, { data: null, error: { message: 'viola la FK', code: '23503' } }),
    });
    await expect(tx.transaction(async (t) => { await t.delete('rateTable', 'x'); })).rejects.toThrow(ForeignKeyError);
  });

  it('una transacción manda todas las escrituras juntas a /tarifas/tx', async () => {
    const fetchImpl = fakeFetch(200, []);
    const ds = new HttpDataSource({ baseUrl: 'https://api', fetchImpl });

    await ds.transaction(async (tx) => {
      await tx.update('settlement', 's1', { status: 'Anulado', superseded_by: 's2' });
      await tx.insert('settlement', { id: 's2' });
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, NonNullable<Parameters<typeof fetch>[1]>];
    expect(url).toBe('https://api/tarifas/tx');
    expect(JSON.parse(String(init.body)).ops.map((o: { op: string }) => o.op)).toEqual(['update', 'insert']);
  });

  it('sin fetchImpl llama al fetch global con su propio this (el navegador rechaza otro: "Illegal invocation")', async () => {
    const seen: unknown[] = [];
    const strictFetch = vi.fn(function (this: unknown) {
      seen.push(this);
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', strictFetch);
    try {
      const ds = new HttpDataSource({ baseUrl: 'https://api' });
      await expect(ds.find('country')).resolves.toEqual([]);
      expect(strictFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('junta lecturas idénticas en vuelo en una sola petición y entrega copias independientes', async () => {
    const fetchImpl = fakeFetch(200, [{ id: 'c1', name: 'CR' }]);
    const ds = new HttpDataSource({ baseUrl: 'https://api', fetchImpl });

    const [a, b] = await Promise.all([ds.find('country'), ds.find('country')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    a[0].name = 'mutado';
    expect(b[0].name).toBe('CR');

    await ds.find('country'); // ya no hay nada en vuelo: va a la API de nuevo (sin caché)
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
