// @vitest-environment jsdom
//
// Marcar un pedido (anular, liquidar después, incluir): si el servidor lo rechaza, quien llama recibe SU motivo
// (antes se perdía y la pantalla siempre decía lo mismo).
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOrderMark } from '../../../lib/tarifas/tripsDataSource';
import type { TripOrder } from '../../../lib/tarifas/types';
import { useOrderMarking } from '../hooks/useOrderMarking';

vi.mock('../../../lib/tarifas/tripsDataSource', () => ({ setOrderMark: vi.fn() }));
const mark = vi.mocked(setOrderMark);

const trip = { id: 'T1', countryId: 'CR' };
const order = { orderId: 'O1' } as TripOrder;

beforeEach(() => mark.mockReset());
afterEach(cleanup);

describe('useOrderMarking.apply', () => {
  it('con éxito devuelve ok y limpia el formulario de anulación', async () => {
    mark.mockResolvedValue({ error: null } as Awaited<ReturnType<typeof setOrderMark>>);
    const { result } = renderHook(() => useOrderMarking(trip));
    act(() => { result.current.setAnnulling('O1'); result.current.setReason('duplicado'); });

    let out!: { ok: boolean; error: string | null };
    await act(async () => { out = await result.current.apply(order, 'ANULADO', 'duplicado'); });
    expect(out).toEqual({ ok: true, error: null });
    expect(result.current.annulling).toBeNull();
    expect(result.current.reason).toBe('');
  });

  it('si el servidor rechaza devuelve su motivo y deja el formulario como estaba', async () => {
    mark.mockResolvedValue({ error: 'Tu rol no puede marcar pedidos.' } as Awaited<ReturnType<typeof setOrderMark>>);
    const { result } = renderHook(() => useOrderMarking(trip));
    act(() => { result.current.setAnnulling('O1'); result.current.setReason('duplicado'); });

    let out!: { ok: boolean; error: string | null };
    await act(async () => { out = await result.current.apply(order, 'ANULADO', 'duplicado'); });
    expect(out).toEqual({ ok: false, error: 'Tu rol no puede marcar pedidos.' });
    expect(result.current.annulling).toBe('O1');
    expect(result.current.reason).toBe('duplicado');
    expect(result.current.busy).toBe(false);
  });

  it('si la llamada lanza una excepción devuelve su mensaje en vez de dejarla suelta', async () => {
    mark.mockRejectedValueOnce(new Error('sin conexión'));
    const { result } = renderHook(() => useOrderMarking(trip));
    let out!: { ok: boolean; error: string | null };
    await act(async () => { out = await result.current.apply(order, 'DIFERIDO'); });
    expect(out).toEqual({ ok: false, error: 'sin conexión' });
    expect(result.current.busy).toBe(false);
  });

  it('un pedido sin id no se puede marcar', async () => {
    const { result } = renderHook(() => useOrderMarking(trip));
    let out!: { ok: boolean; error: string | null };
    await act(async () => { out = await result.current.apply({ orderId: null } as unknown as TripOrder, 'ANULADO'); });
    expect(out.ok).toBe(false);
    expect(mark).not.toHaveBeenCalled();
  });
});
