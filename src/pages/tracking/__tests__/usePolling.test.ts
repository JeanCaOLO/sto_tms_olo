// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay } from '../hooks/polling-runner';
import { usePolling } from '../hooks/usePolling';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('usePolling', () => {
  it('consulta al montar y cada intervalo', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => usePolling(fetcher, [], { intervalMs: 1000 }));
    await flush();
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
    expect(fetcher).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('no encima consultas: si la anterior sigue en vuelo, el refresco espera', async () => {
    let resolve: (v: string) => void = () => {};
    const fetcher = vi.fn().mockImplementation(() => new Promise<string>((r) => { resolve = r; }));
    const { result } = renderHook(() => usePolling(fetcher, [], { intervalMs: 1000, timeoutMs: 60_000 }));
    act(() => { result.current.refresh(); result.current.refresh(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { resolve('lento'); await Promise.resolve(); });
    expect(result.current.data).toBe('lento');
  });

  it('aborta la consulta que pasa del timeout y lo marca como error', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn().mockImplementation((signal: AbortSignal) => new Promise((_, reject) => {
      signals.push(signal);
      signal.addEventListener('abort', () => reject(new Error('abortado')));
    }));
    const { result } = renderHook(() => usePolling(fetcher, [], { intervalMs: 1000, timeoutMs: 500 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(signals[0].aborted).toBe(true);
    expect(result.current.error?.message).toBe('abortado');
  });

  it('ante errores espera más (backoff) y conserva el último dato bueno', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('bueno').mockRejectedValue(new Error('caído'));
    const { result } = renderHook(() => usePolling(fetcher, [], { intervalMs: 1000 }));
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // 2.ª: falla
    expect(result.current.data).toBe('bueno');
    expect(result.current.error?.message).toBe('caído');
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); }); // backoff 2 s: aún no
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('al cambiar las dependencias limpia el dato anterior y descarta la respuesta vieja', async () => {
    let resolveFirst: (v: string) => void = () => {};
    let resolveSecond: (v: string) => void = () => {};
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((r) => { resolveFirst = r; }))
      .mockImplementationOnce(() => new Promise<string>((r) => { resolveSecond = r; }));
    const { result, rerender } = renderHook(({ dep }) => usePolling(fetcher, [dep]), { initialProps: { dep: 1 } });
    rerender({ dep: 2 });
    await act(async () => { resolveFirst('primero'); await Promise.resolve(); });
    expect(result.current.data).toBeNull();
    await act(async () => { resolveSecond('segundo'); await Promise.resolve(); });
    expect(result.current.data).toBe('segundo');
  });

  it('con enabled en false no consulta, limpia el dato y refresh no hace nada', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => usePolling(fetcher, [], { enabled: false }));
    act(() => result.current.refresh());
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it('la espera crece al doble por cada error seguido, con tope de 60 s', () => {
    expect(backoffDelay(15_000, 0)).toBe(15_000);
    expect(backoffDelay(15_000, 1)).toBe(30_000);
    expect(backoffDelay(15_000, 2)).toBe(60_000);
    expect(backoffDelay(15_000, 5)).toBe(60_000);
  });
});
