// Transacciones del cliente HTTP: inserciones seguidas viajan juntas (`insert_many`), con vuelta atrás
// contra un backend que todavía no la conoce, y tiempo máximo propio para `/tx`. Contra un `fetch` simulado.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpDataSource, resetHttpFeatureFlags } from '../http-datasource';
import { coalesceInserts } from '../http/coalesce';
import type { TxOperation } from '../http/transport';

type RequestInit = NonNullable<Parameters<typeof fetch>[1]>;

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const source = (fetchImpl: unknown, extra = {}) =>
  new HttpDataSource({ baseUrl: 'https://api/api', fetchImpl: fetchImpl as typeof fetch, retryDelayMs: 0, ...extra });

const opsOf = (fetchImpl: ReturnType<typeof vi.fn>, n: number): TxOperation[] =>
  JSON.parse(String((fetchImpl.mock.calls[n] as [string, RequestInit])[1].body)).ops;

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ table_id: 't1', key: [`Z${i}`], amount: '1.00', row_order: i + 1 }));

beforeEach(() => resetHttpFeatureFlags());

describe('coalesceInserts', () => {
  const insert = (table: string, n: number): TxOperation => ({ op: 'insert', table, values: { n } });

  it('junta solo las inserciones seguidas de la misma tabla y deja el resto igual', () => {
    const ops: TxOperation[] = [
      { op: 'delete', table: 'a', id: '1' },
      insert('a', 1), insert('a', 2), insert('a', 3),
      { op: 'update', table: 'a', id: '2', values: { x: 1 } },
      insert('b', 1),
      insert('a', 4), insert('a', 5),
    ];
    expect(coalesceInserts(ops)).toEqual([
      { op: 'delete', table: 'a', id: '1' },
      { op: 'insert_many', table: 'a', rows: [{ n: 1 }, { n: 2 }, { n: 3 }] },
      { op: 'update', table: 'a', id: '2', values: { x: 1 } },
      insert('b', 1),
      { op: 'insert_many', table: 'a', rows: [{ n: 4 }, { n: 5 }] },
    ]);
  });

  it('una inserción suelta no cambia, y cambiar de tabla corta el grupo', () => {
    expect(coalesceInserts([insert('a', 1)])).toEqual([insert('a', 1)]);
    expect(coalesceInserts([insert('a', 1), insert('b', 1), insert('a', 2)])).toEqual([insert('a', 1), insert('b', 1), insert('a', 2)]);
  });
});

describe('transacción con insert_many', () => {
  it('350 inserciones salen como UNA operación, en orden', async () => {
    const fetchImpl = vi.fn(async () => json(200, []));
    await source(fetchImpl).transaction(async (tx) => {
      for (const row of rows(350)) await tx.insert('rateTableRow', row);
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const ops = opsOf(fetchImpl, 0);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('insert_many');
    expect(ops[0].rows).toHaveLength(350);
    expect(ops[0].rows?.map((r) => r.row_order)).toEqual(Array.from({ length: 350 }, (_, i) => i + 1));
  });

  it('si el backend no conoce insert_many (400), repite como operaciones sueltas y lo recuerda', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const ops = JSON.parse(String(init.body)).ops as TxOperation[];
      return ops.some((o) => o.op === 'insert_many') ? json(400, { error: { message: 'Cada operación debe ser…' } }) : json(200, []);
    });
    const ds = source(fetchImpl);
    const run = () => ds.transaction(async (tx) => { for (const row of rows(3)) await tx.insert('rateTableRow', row); });

    await run();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(opsOf(fetchImpl, 0)[0].op).toBe('insert_many');
    expect(opsOf(fetchImpl, 1).map((o) => o.op)).toEqual(['insert', 'insert', 'insert']);

    await run(); // ya no vuelve a intentar con insert_many
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(opsOf(fetchImpl, 2)).toHaveLength(3);
  });

  it('un 400 real (también sin agrupar) se informa y no se marca como no soportado', async () => {
    const fetchImpl = vi.fn(async () => json(400, { error: { message: 'Columna desconocida "x"' } }));
    const ds = source(fetchImpl);
    await expect(ds.transaction(async (tx) => { for (const row of rows(2)) await tx.insert('rateTableRow', row); }))
      .rejects.toThrow(/Columna desconocida/);
    await expect(ds.transaction(async (tx) => { for (const row of rows(2)) await tx.insert('rateTableRow', row); }))
      .rejects.toThrow(/Columna desconocida/);
    expect(opsOf(fetchImpl, 2)[0].op).toBe('insert_many'); // en la segunda vuelta vuelve a intentar agrupado
  });

  it('el /tx tiene su propio tiempo máximo, mayor que el de una llamada suelta', async () => {
    vi.useFakeTimers();
    try {
      const slow = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('abortado')));
        setTimeout(() => resolve(json(200, [])), 30_000);
      }));
      const ds = source(slow, { timeoutMs: 20_000 });
      const done = ds.transaction(async (tx) => { await tx.insert('rateTableRow', rows(1)[0]); });
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(done).resolves.toBeUndefined(); // a los 30 s sigue valiendo: el tope de /tx es de 45 s
    } finally {
      vi.useRealTimers();
    }
  });
});
