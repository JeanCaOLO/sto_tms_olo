// @vitest-environment jsdom
//
// El rango "Hoy" de Proformas se calculaba una vez al abrir la pantalla: pasada la medianoche seguía mostrando ayer.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rangeFor, toDateKey, type DateRange } from '../../../lib/tarifas/proformas';
import { useTodayRange } from './useTodayRange';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 16, 23, 50)); // 16-oct-2026 23:50 hora local
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useTodayRange', () => {
  it('pasada la medianoche recalcula el rango "hoy"', () => {
    const setRange = vi.fn();
    const range = rangeFor('today');
    renderHook(() => useTodayRange(range, setRange));

    act(() => { vi.advanceTimersByTime(60_000); }); // 23:51: sigue siendo el mismo día
    expect(setRange).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(2026, 9, 17, 0, 5));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(setRange).toHaveBeenCalledTimes(1);
    const next = setRange.mock.calls[0][0] as DateRange;
    expect(next.preset).toBe('today');
    expect(next.from).toBe(toDateKey(new Date(2026, 9, 17)));
    expect(next.to).toBe(next.from);
  });

  it('también al volver a la pestaña', () => {
    const setRange = vi.fn();
    renderHook(() => useTodayRange(rangeFor('today'), setRange));
    vi.setSystemTime(new Date(2026, 9, 17, 8, 0));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(setRange).toHaveBeenCalledTimes(1);
  });

  it('no toca un rango que el usuario eligió (semana, mes, propio, todo)', () => {
    const setRange = vi.fn();
    renderHook(() => useTodayRange(rangeFor('week'), setRange));
    vi.setSystemTime(new Date(2026, 9, 18, 8, 0));
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(setRange).not.toHaveBeenCalled();
  });
});
