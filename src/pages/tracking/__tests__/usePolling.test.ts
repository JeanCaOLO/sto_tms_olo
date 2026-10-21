// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from '../hooks/usePolling';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePolling', () => {
  it('consulta al montar y cada intervalo', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => usePolling(fetcher, [], { intervalMs: 1000 }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.data).toBe('ok');
    expect(result.current.loading).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('no consulta con la pestaña oculta', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    renderHook(() => usePolling(fetcher, [], { intervalMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(fetcher).toHaveBeenCalledTimes(1); // solo la carga inicial
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('guarda el error y conserva el último dato bueno', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('bueno').mockRejectedValue(new Error('caído'));
    const { result } = renderHook(() => usePolling(fetcher, [], { intervalMs: 1000 }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(result.current.data).toBe('bueno');
    expect(result.current.error?.message).toBe('caído');
  });

  it('descarta la respuesta vieja cuando cambian las dependencias', async () => {
    let resolveFirst: (v: string) => void = () => {};
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((r) => { resolveFirst = r; }))
      .mockResolvedValue('segundo');
    const { result, rerender } = renderHook(({ dep }) => usePolling(fetcher, [dep]), { initialProps: { dep: 1 } });
    rerender({ dep: 2 });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { resolveFirst('primero'); await Promise.resolve(); });
    expect(result.current.data).toBe('segundo');
  });

  it('con enabled en false no consulta y limpia el dato', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => usePolling(fetcher, [], { enabled: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });
});
