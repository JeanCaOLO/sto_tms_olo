// @vitest-environment jsdom
//
// Cambiar de rango o de país mientras una consulta sigue en vuelo: la respuesta vieja que llega tarde no puede
// reemplazar a la nueva ni apagar el "cargando" de la consulta vigente.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listClaimRows, listProformas, type ClaimRow, type DateRange, type ProformaWithPhases } from '../../../lib/tarifas/proformas';
import { useClaims } from './useClaims';
import { useProformaList } from './useProformaList';

vi.mock('../../../lib/tarifas/proformas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tarifas/proformas')>()),
  listProformas: vi.fn(),
  listClaimRows: vi.fn(),
  assignPendingSettlements: vi.fn(async () => ({ created: 0, added: 0, skipped: null, error: null })),
}));

const listP = vi.mocked(listProformas);
const listC = vi.mocked(listClaimRows);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const proformas = (...ids: string[]) => ids.map((id) => ({ proforma: { id } })) as unknown as ProformaWithPhases[];
const claims = (...ids: string[]) => ids.map((id) => ({ claim: { id } })) as unknown as ClaimRow[];
const range = (day: string): DateRange => ({ preset: 'custom', from: day, to: day });

beforeEach(() => { listP.mockReset(); listC.mockReset(); });
afterEach(cleanup);

describe('useProformaList · respuestas viejas', () => {
  it('la respuesta del rango anterior que llega tarde no reemplaza a la nueva', async () => {
    const old = deferred<ProformaWithPhases[]>();
    const fresh = deferred<ProformaWithPhases[]>();
    listP.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);

    const { result, rerender } = renderHook(
      ({ r }) => useProformaList('CR', false, 'review', r),
      { initialProps: { r: range('2026-10-15') } },
    );
    rerender({ r: range('2026-10-16') });

    await act(async () => { fresh.resolve(proformas('nueva')); });
    expect(result.current.rows.map((x) => x.proforma.id)).toEqual(['nueva']);
    expect(result.current.loading).toBe(false);

    await act(async () => { old.resolve(proformas('vieja')); });
    expect(result.current.rows.map((x) => x.proforma.id)).toEqual(['nueva']);
  });

  it('una respuesta vieja no apaga el "cargando" de la consulta vigente', async () => {
    const old = deferred<ProformaWithPhases[]>();
    const fresh = deferred<ProformaWithPhases[]>();
    listP.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(
      ({ r }) => useProformaList('CR', false, 'review', r),
      { initialProps: { r: range('2026-10-15') } },
    );
    rerender({ r: range('2026-10-16') });

    await act(async () => { old.resolve(proformas('vieja')); });
    expect(result.current.loading).toBe(true);
    expect(result.current.rows).toEqual([]);

    await act(async () => { fresh.resolve(proformas('nueva')); });
    expect(result.current.loading).toBe(false);
  });

  it('el error de una consulta vieja no se muestra sobre la nueva', async () => {
    const old = deferred<ProformaWithPhases[]>();
    const fresh = deferred<ProformaWithPhases[]>();
    listP.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(
      ({ r }) => useProformaList('CR', false, 'review', r),
      { initialProps: { r: range('2026-10-15') } },
    );
    rerender({ r: range('2026-10-16') });
    await act(async () => { fresh.resolve(proformas('nueva')); });

    await act(async () => { old.reject(new Error('rango viejo caído')); });
    expect(result.current.error).toBeNull();
    expect(result.current.rows.map((x) => x.proforma.id)).toEqual(['nueva']);
  });
});

describe('useClaims · respuestas viejas', () => {
  it('la respuesta del rango anterior que llega tarde no reemplaza a la nueva', async () => {
    const old = deferred<ClaimRow[]>();
    const fresh = deferred<ClaimRow[]>();
    listC.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(
      ({ r }) => useClaims('CR', r, true),
      { initialProps: { r: range('2026-10-15') } },
    );
    rerender({ r: range('2026-10-16') });

    await act(async () => { fresh.resolve(claims('nuevo')); });
    await act(async () => { old.resolve(claims('viejo')); });
    expect(result.current.rows.map((x) => x.claim.id)).toEqual(['nuevo']);
    expect(result.current.loading).toBe(false);
  });
});
