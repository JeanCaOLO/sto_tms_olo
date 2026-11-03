// @vitest-environment jsdom
//
// Historial de liquidaciones: "Cargar más" no duplica filas con un doble clic ni mezcla filas de un
// filtro anterior si cambia el rango mientras carga.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSettlementsPage } from '../api/liquidacionesApi';
import { useSettlementsLoader } from '../hooks/useSettlementsLoader';
import type { SettlementRecord } from '../../../lib/tarifas/types';

vi.mock('../api/liquidacionesApi', () => ({ fetchSettlementsPage: vi.fn() }));
const fetchPage = vi.mocked(fetchSettlementsPage);

const row = (id: string) => ({ id }) as unknown as SettlementRecord;
const page = (ids: string[], next: unknown = null) =>
  ({ rows: ids.map(row), next }) as unknown as Awaited<ReturnType<typeof fetchSettlementsPage>>;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const setError = vi.fn();
interface Props { from: string; to: string }
const render = (initialProps: Props) => renderHook(
  (p: Props) => useSettlementsLoader('CR', p.from, p.to, setError),
  { initialProps },
);

beforeEach(() => {
  fetchPage.mockReset();
  setError.mockReset();
});
afterEach(cleanup);

async function loaded(props: Props = { from: '2026-10-01', to: '2026-10-31' }) {
  fetchPage.mockResolvedValueOnce(page(['A'], 'cursor-1'));
  const hook = render(props);
  await act(async () => { await hook.result.current.loadSettlements(); });
  expect(hook.result.current.settlements.map((s) => s.id)).toEqual(['A']);
  return hook;
}

describe('useSettlementsLoader · cargar más', () => {
  it('un doble clic en "Cargar más" agrega la página una sola vez', async () => {
    const { result } = await loaded();
    const second = deferred<ReturnType<typeof page>>();
    fetchPage.mockReturnValueOnce(second.promise);

    await act(async () => {
      void result.current.loadMore();
      void result.current.loadMore();
    });
    await act(async () => { second.resolve(page(['B'], null)); });

    await waitFor(() => expect(result.current.settlements.map((s) => s.id)).toEqual(['A', 'B']));
    expect(fetchPage).toHaveBeenCalledTimes(2); // la primera página + una sola de "más"
    expect(result.current.cargandoMas).toBe(false);
  });

  it('si cambia el filtro mientras carga, no mezcla filas del filtro anterior', async () => {
    const { result, rerender } = await loaded();
    const lateOld = deferred<ReturnType<typeof page>>();
    fetchPage.mockReturnValueOnce(lateOld.promise); // "más" del filtro viejo, todavía en vuelo

    await act(async () => { void result.current.loadMore(); });

    // El usuario cambia el rango: se recarga la lista con el filtro nuevo.
    fetchPage.mockResolvedValueOnce(page(['N1'], null));
    rerender({ from: '2026-09-01', to: '2026-09-30' });
    await act(async () => { await result.current.loadSettlements(); });
    expect(result.current.settlements.map((s) => s.id)).toEqual(['N1']);

    // Llega tarde la página del filtro viejo: se descarta.
    await act(async () => { lateOld.resolve(page(['VIEJA'], null)); });
    expect(result.current.settlements.map((s) => s.id)).toEqual(['N1']);
    expect(result.current.cargandoMas).toBe(false);
  });

  it('sin más páginas no hace nada', async () => {
    fetchPage.mockResolvedValueOnce(page(['A'], null));
    const { result } = render({ from: 'a', to: 'b' });
    await act(async () => { await result.current.loadSettlements(); });
    await act(async () => { await result.current.loadMore(); });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('si falla avisa y se puede volver a intentar', async () => {
    const { result } = await loaded();
    fetchPage.mockRejectedValueOnce(new Error('sin red'));
    await act(async () => { await result.current.loadMore(); });
    expect(setError).toHaveBeenCalledWith('sin red');
    expect(result.current.cargandoMas).toBe(false);

    fetchPage.mockResolvedValueOnce(page(['B'], null));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.settlements.map((s) => s.id)).toEqual(['A', 'B']);
  });
});
