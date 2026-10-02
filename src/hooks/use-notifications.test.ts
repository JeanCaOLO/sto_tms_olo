// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotifications } from './use-notifications';

// localStorage en memoria para simular la persistencia entre "recargas"
// (cada renderHook nuevo = un montaje fresco del hook, como recargar la página).
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
});

describe('useNotifications', () => {
  it('arranca con todas sin leer', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.unreadCount).toBe(result.current.items.length);
  });

  it('markRead deja la notificación leída y baja el contador', () => {
    const { result } = renderHook(() => useNotifications());
    const total = result.current.items.length;
    act(() => result.current.markRead('n1'));
    expect(result.current.unreadCount).toBe(total - 1);
    expect(result.current.items.find((n) => n.id === 'n1')!.read).toBe(true);
  });

  it('el leído PERSISTE tras recargar (nuevo montaje del hook)', () => {
    const primero = renderHook(() => useNotifications());
    act(() => primero.result.current.markRead('n1'));

    // Simula recargar la página: montar el hook de nuevo (mismo localStorage).
    const segundo = renderHook(() => useNotifications());
    expect(segundo.result.current.items.find((n) => n.id === 'n1')!.read).toBe(true);
  });

  it('markAllRead deja el contador en 0 y persiste', () => {
    const primero = renderHook(() => useNotifications());
    act(() => primero.result.current.markAllRead());
    expect(primero.result.current.unreadCount).toBe(0);

    const segundo = renderHook(() => useNotifications());
    expect(segundo.result.current.unreadCount).toBe(0);
  });
});
