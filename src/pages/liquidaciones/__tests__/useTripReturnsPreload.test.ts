// @vitest-environment jsdom
//
// Las devoluciones del viaje se precargan una vez por apertura, no con cada cálculo nuevo.
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listTripReturns } from '../../../lib/tarifas/tripsDataSource';
import { useTripReturnsPreload } from '../hooks/useTripReturnsPreload';
import type { SettlementRecord } from '../../../lib/tarifas/types';

vi.mock('../../../lib/tarifas/tripsDataSource', () => ({ listTripReturns: vi.fn() }));
const listReturns = vi.mocked(listTripReturns);

const onLoaded = vi.fn();
const onError = vi.fn();

interface Props { calculation: unknown; tripId: string; settlement: SettlementRecord | null; isOpen: boolean }
const render = (initialProps: Props) => renderHook(
  (p: Props) => useTripReturnsPreload(p.calculation, p.tripId, p.settlement, p.isOpen, onLoaded, onError),
  { initialProps },
);

beforeEach(() => {
  listReturns.mockReset();
  listReturns.mockResolvedValue([]);
  onLoaded.mockReset();
  onError.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useTripReturnsPreload', () => {
  it('no hace nada sin cálculo ni con el modal cerrado', () => {
    render({ calculation: null, tripId: 'T1', settlement: null, isOpen: true });
    render({ calculation: {}, tripId: 'T1', settlement: null, isOpen: false });
    expect(listReturns).not.toHaveBeenCalled();
  });

  it('precarga una vez aunque lleguen cálculos nuevos (no pisa lo cargado a mano)', async () => {
    const { rerender } = render({ calculation: { n: 1 }, tripId: 'T1', settlement: null, isOpen: true });
    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    rerender({ calculation: { n: 2 }, tripId: 'T1', settlement: null, isOpen: true });
    rerender({ calculation: { n: 3 }, tripId: 'T1', settlement: null, isOpen: true });
    expect(listReturns).toHaveBeenCalledTimes(1);
  });

  it('al cerrar y volver a abrir el modal vuelve a precargar', async () => {
    const { rerender } = render({ calculation: { n: 1 }, tripId: 'T1', settlement: null, isOpen: true });
    await waitFor(() => expect(listReturns).toHaveBeenCalledTimes(1));
    rerender({ calculation: { n: 1 }, tripId: 'T1', settlement: null, isOpen: false });
    rerender({ calculation: { n: 2 }, tripId: 'T1', settlement: null, isOpen: true });
    await waitFor(() => expect(listReturns).toHaveBeenCalledTimes(2));
  });

  it('otro viaje vuelve a precargar', async () => {
    const { rerender } = render({ calculation: { n: 1 }, tripId: 'T1', settlement: null, isOpen: true });
    await waitFor(() => expect(listReturns).toHaveBeenCalledTimes(1));
    rerender({ calculation: { n: 2 }, tripId: 'T2', settlement: null, isOpen: true });
    await waitFor(() => expect(listReturns).toHaveBeenCalledTimes(2));
    expect(listReturns).toHaveBeenLastCalledWith('T2');
  });

  it('al re-liquidar no precarga (usa las devoluciones guardadas)', () => {
    render({ calculation: {}, tripId: 'T1', settlement: { id: 'S1' } as SettlementRecord, isOpen: true });
    expect(listReturns).not.toHaveBeenCalled();
  });

  it('si falla avisa y reintenta con el siguiente cálculo', async () => {
    listReturns.mockRejectedValueOnce(new Error('sin red'));
    const { rerender } = render({ calculation: { n: 1 }, tripId: 'T1', settlement: null, isOpen: true });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    rerender({ calculation: { n: 2 }, tripId: 'T1', settlement: null, isOpen: true });
    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(listReturns).toHaveBeenCalledTimes(2);
  });
});
