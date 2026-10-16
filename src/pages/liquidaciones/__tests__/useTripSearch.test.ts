// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_DEBOUNCE_MS, useTripSearch } from '../hooks/useTripSearch';
import { applyOptions } from '../../../lib/tarifas/data/memory/filtering';

describe('useTripSearch', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const flush = async (ms = SEARCH_DEBOUNCE_MS) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

  it('no consulta con menos de 3 caracteres', async () => {
    const search = vi.fn().mockResolvedValue(new Set(['t1']));
    const { result } = renderHook(() => useTripSearch(search));
    act(() => result.current.onSearchChange('ab'));
    await flush();
    expect(search).not.toHaveBeenCalled();
    expect(result.current.hasMatchingOrder('t1')).toBe(false);
  });

  it('espera la pausa y suma los viajes encontrados por pedido', async () => {
    const search = vi.fn().mockResolvedValue(new Set(['t1']));
    const { result } = renderHook(() => useTripSearch(search));
    act(() => result.current.onSearchChange('GD-12'));
    await flush(SEARCH_DEBOUNCE_MS - 1);
    expect(search).not.toHaveBeenCalled();
    await flush(1);
    expect(search).toHaveBeenCalledWith('GD-12');
    expect(result.current.hasMatchingOrder('t1')).toBe(true);
    expect(result.current.hasMatchingOrder('t2')).toBe(false);
    expect(result.current.searching).toBe(false);
  });

  it('descarta la respuesta vieja cuando el texto cambió', async () => {
    let resolveOld: (s: Set<string>) => void = () => {};
    const search = vi.fn()
      .mockImplementationOnce(() => new Promise<Set<string>>((r) => { resolveOld = r; }))
      .mockResolvedValueOnce(new Set(['nuevo']));
    const { result } = renderHook(() => useTripSearch(search));
    act(() => result.current.onSearchChange('viejo'));
    await flush();
    act(() => result.current.onSearchChange('nuevo'));
    await flush();
    await act(async () => { resolveOld(new Set(['viejo'])); });
    expect(result.current.hasMatchingOrder('nuevo')).toBe(true);
    expect(result.current.hasMatchingOrder('viejo')).toBe(false);
  });

  it('si la búsqueda remota falla no rompe: solo no suma viajes', async () => {
    const search = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTripSearch(search));
    act(() => result.current.onSearchChange('GD-12'));
    await flush();
    expect(result.current.hasMatchingOrder('t1')).toBe(false);
    expect(result.current.searching).toBe(false);
  });

  it('limpiar el texto vacía los viajes sumados', async () => {
    const search = vi.fn().mockResolvedValue(new Set(['t1']));
    const { result } = renderHook(() => useTripSearch(search));
    act(() => result.current.onSearchChange('GD-12'));
    await flush();
    act(() => result.current.onSearchChange(''));
    expect(result.current.hasMatchingOrder('t1')).toBe(false);
  });
});

describe('ilike en el almacén en memoria', () => {
  const rows = [
    { id: '1', guide_number: 'GD-0012', order_number: 'PED-9', customer_name: 'Cofersa Ñandú' },
    { id: '2', guide_number: 'GD-0099', order_number: 'PED-12', customer_name: 'EPA' },
  ];
  const find = (column: string, value: string) =>
    applyOptions(rows, { where: [{ column, op: 'ilike', value }] }).map((r) => r.id);

  it('contiene el texto sin distinguir mayúsculas ni tildes', () => {
    expect(find('customer_name', 'nandu')).toEqual(['1']);
  });

  it('con varias columnas basta que una coincida', () => {
    expect(find('guide_number|order_number|customer_name', '12')).toEqual(['1', '2']);
    expect(find('guide_number|order_number|customer_name', 'epa')).toEqual(['2']);
  });
});
