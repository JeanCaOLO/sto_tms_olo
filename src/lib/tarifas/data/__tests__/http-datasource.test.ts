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
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
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

  it('una transacción manda todas las escrituras juntas a /tarifas/tx', async () => {
    const fetchImpl = fakeFetch(200, []);
    const ds = new HttpDataSource({ baseUrl: 'https://api', fetchImpl });

    await ds.transaction(async (tx) => {
      await tx.update('settlement', 's1', { status: 'Anulado', superseded_by: 's2' });
      await tx.insert('settlement', { id: 's2' });
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api/tarifas/tx');
    expect(JSON.parse(String(init.body)).ops.map((o: { op: string }) => o.op)).toEqual(['update', 'insert']);
  });
});
