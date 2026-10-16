// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock del endpoint de vencimientos: la campana consume GET /v1/alerts/expirations.
const alertsBody = {
  data: [
    { type: 'carrier_contract', entity_id: 'c1', name: 'Transporte Andino', expiry_date: '2026-11-01', days_left: 20, status: 'due_soon' },
    { type: 'driver_license', entity_id: 'd1', name: 'José Ramírez', carrier_name: 'Andino', license_number: 'A-9', expiry_date: '2026-10-05', days_left: -7, status: 'expired' },
  ],
};
vi.mock('../lib/supabase', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, status: 200, body: alertsBody })),
}));

import { useNotifications } from './use-notifications';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
});

// id estable que arma el hook por alerta (type:entity:fecha).
const ID_CONTRATO = 'exp:carrier_contract:c1:2026-11-01';

describe('useNotifications', () => {
  it('carga las alertas de vencimiento y arrancan sin leer', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.items.length).toBe(2));
    expect(result.current.unreadCount).toBe(2);
  });

  it('mapea el estado a ícono/color (vencido = rojo, por vencer = ámbar)', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.items.length).toBe(2));
    const contrato = result.current.items.find((n) => n.id === ID_CONTRATO)!;
    expect(contrato.iconColor).toBe('amber');
    expect(result.current.items.find((n) => n.id.startsWith('exp:driver_license'))!.iconColor).toBe('red');
  });

  it('markRead deja la alerta leída y baja el contador', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.items.length).toBe(2));
    act(() => result.current.markRead(ID_CONTRATO));
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.items.find((n) => n.id === ID_CONTRATO)!.read).toBe(true);
  });

  it('el leído PERSISTE tras recargar (nuevo montaje del hook)', async () => {
    const primero = renderHook(() => useNotifications());
    await waitFor(() => expect(primero.result.current.items.length).toBe(2));
    act(() => primero.result.current.markRead(ID_CONTRATO));

    const segundo = renderHook(() => useNotifications());
    await waitFor(() => expect(segundo.result.current.items.length).toBe(2));
    expect(segundo.result.current.items.find((n) => n.id === ID_CONTRATO)!.read).toBe(true);
  });

  it('markAllRead deja el contador en 0 y persiste', async () => {
    const primero = renderHook(() => useNotifications());
    await waitFor(() => expect(primero.result.current.items.length).toBe(2));
    act(() => primero.result.current.markAllRead());
    expect(primero.result.current.unreadCount).toBe(0);

    const segundo = renderHook(() => useNotifications());
    await waitFor(() => expect(segundo.result.current.items.length).toBe(2));
    expect(segundo.result.current.unreadCount).toBe(0);
  });
});
