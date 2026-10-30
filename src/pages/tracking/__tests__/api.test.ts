import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ apiFetch: vi.fn() }));

import {
  errorKey, getViaje, iniciarViaje, isTrackingMock, listChoferes, listViajes, pollIntervalMs, setTrackingTransport, TrackingApiError,
  trackingNow,
} from '../api';
import { apiFetch } from '../../../lib/supabase';

const ok = (data: unknown) => ({ ok: true, status: 200, body: { data, error: null } });

afterEach(() => setTrackingTransport(apiFetch));

describe('cliente de tracking', () => {
  it('arma la lista con activos, búsqueda, país, cursor y resumen', async () => {
    const transport = vi.fn().mockResolvedValue(ok({ items: [], next_cursor: null }));
    setTrackingTransport(transport);
    await listViajes({ mode: 'active', q: ' ABC ', limit: 30, country: 'CR', summary: true });
    expect(transport).toHaveBeenCalledWith('/v1/tracking/viajes?limit=30&activos=1&q=ABC&pais=CR&include=summary', { signal: undefined });
    await listViajes({ mode: 'all', q: '', limit: 60, cursor: 'c1' });
    expect(transport).toHaveBeenLastCalledWith('/v1/tracking/viajes?limit=60&cursor=c1', { signal: undefined });
  });

  it('pide el detalle del viaje, pasando la señal de cancelación', async () => {
    const transport = vi.fn().mockResolvedValue(ok({ id: 'x' }));
    setTrackingTransport(transport);
    const signal = new AbortController().signal;
    expect(await getViaje('x', signal)).toEqual({ id: 'x' });
    expect(transport).toHaveBeenCalledWith('/v1/tracking/viajes/x', { signal });
  });

  it('inicia con POST (solo se usa en modo mock)', async () => {
    const transport = vi.fn().mockResolvedValue(ok({ route_id: 'r1', created: true }));
    setTrackingTransport(transport);
    await iniciarViaje('t1');
    expect(transport).toHaveBeenCalledWith('/v1/tracking/viajes/t1/iniciar', { method: 'POST', body: '{}' });
  });

  it('lanza TrackingApiError con mensaje y status, y lo traduce a una clave i18n', async () => {
    setTrackingTransport(vi.fn().mockResolvedValue({ ok: false, status: 404, body: { error: { message: 'Viaje no encontrado' } } }));
    const error = await getViaje('r1').catch((e) => e);
    expect(error).toBeInstanceOf(TrackingApiError);
    expect(error.message).toBe('Viaje no encontrado');
    expect(error.status).toBe(404);
    expect(errorKey(error)).toBe('tracking.errorNotFound');
    expect(errorKey(new TrackingApiError('x', 409))).toBe('tracking.errorConflict');
    expect(errorKey(new Error('red'))).toBe('tracking.errorGeneric');
  });

  it('pide los choferes en línea, con el país si hay, y pasa la señal de cancelación', async () => {
    const transport = vi.fn().mockResolvedValue(ok([]));
    setTrackingTransport(transport);
    const signal = new AbortController().signal;
    await listChoferes(null, signal);
    expect(transport).toHaveBeenCalledWith('/v1/tracking/choferes', { signal });
    await listChoferes('CR');
    expect(transport).toHaveBeenLastCalledWith('/v1/tracking/choferes?pais=CR', { signal: undefined });
  });

  it('el modo mock cambia reloj e intervalo; el normal usa el reloj real y 5 s', () => {
    expect(isTrackingMock()).toBe(false);
    expect(pollIntervalMs()).toBe(5_000);
    setTrackingTransport(vi.fn(), () => 42);
    expect(isTrackingMock()).toBe(true);
    expect(trackingNow()).toBe(42);
    expect(pollIntervalMs()).toBe(3_000);
  });
});
