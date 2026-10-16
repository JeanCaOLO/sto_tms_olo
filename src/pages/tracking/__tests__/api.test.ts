import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('../../../lib/supabase', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { completarViaje, getViaje, iniciarViaje, listViajes, TrackingApiError } from '../api';

const ok = (data: unknown) => ({ ok: true, status: 200, body: { data, error: null } });

beforeEach(() => apiFetch.mockReset());

describe('api de tracking', () => {
  it('arma la consulta de la lista con filtro de activos y búsqueda', async () => {
    apiFetch.mockResolvedValue(ok({ items: [], next_cursor: null }));
    await listViajes({ activos: true, q: ' ABC ', limit: 30 });
    expect(apiFetch).toHaveBeenCalledWith('/v1/tracking/viajes?limit=30&activos=1&q=ABC', undefined);
    await listViajes({ activos: false, q: '', limit: 60 });
    expect(apiFetch).toHaveBeenLastCalledWith('/v1/tracking/viajes?limit=60', undefined);
  });

  it('devuelve data y apunta al viaje correcto', async () => {
    apiFetch.mockResolvedValue(ok({ id: 'x' }));
    expect(await getViaje('x')).toEqual({ id: 'x' });
    expect(apiFetch).toHaveBeenCalledWith('/v1/tracking/viajes/x', undefined);
  });

  it('inicia y completa con POST', async () => {
    apiFetch.mockResolvedValue(ok({ route_id: 'r1', created: true }));
    await iniciarViaje('t1');
    expect(apiFetch).toHaveBeenCalledWith('/v1/tracking/viajes/t1/iniciar', { method: 'POST', body: '{}' });
    await completarViaje('r1', true);
    expect(apiFetch).toHaveBeenLastCalledWith('/v1/tracking/viajes/r1/completar', { method: 'POST', body: '{"force":true}' });
  });

  it('lanza TrackingApiError con el mensaje y el status del backend', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 409, body: { data: null, error: { message: 'Quedan 2 parada(s) sin cerrar.' } } });
    const error = await completarViaje('r1').catch((e) => e);
    expect(error).toBeInstanceOf(TrackingApiError);
    expect(error.message).toBe('Quedan 2 parada(s) sin cerrar.');
    expect(error.status).toBe(409);
  });

  it('usa el status HTTP si el cuerpo no trae mensaje', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 502, body: null });
    await expect(getViaje('x')).rejects.toThrow('HTTP 502');
  });
});
