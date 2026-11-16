import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../../lib/api-client';
import { listTrips, listTripsPage } from './devolucionesApi';

vi.mock('../../../lib/api-client', () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('contrato de páginas de Devoluciones', () => {
  it('conserva filtros y cursor y solicita cien viajes', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200, body: { data: [], next_cursor: 'following' } });
    expect(await listTripsPage({ state: 'pendientes', from: '2026-11-01', to: '2026-11-30', countryId: 'country-a' }, 'a+/=')).toEqual({ trips: [], nextCursor: 'following' });
    const path = vi.mocked(apiFetch).mock.calls[0][0];
    const params = new URL(path, 'http://localhost').searchParams;
    expect(Object.fromEntries(params)).toEqual({ estado: 'pendientes', desde: '2026-11-01', hasta: '2026-11-30', pais: 'country-a', limit: '100', cursor: 'a+/=' });
  });
  it('el lector anterior sigue devolviendo el array sin cambiar el contrato', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200, body: { data: [], next_cursor: 'ignored-by-legacy' } });
    expect(await listTrips({ state: 'todos' })).toEqual([]);
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/v1/devoluciones/viajes?estado=todos');
  });
  it('propaga un error HTTP y rechaza una respuesta sin lista', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: false, status: 400, body: { error: { message: 'cursor inválido' } } });
    await expect(listTripsPage({ state: 'todos' })).rejects.toThrow('cursor inválido');
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true, status: 200, body: { data: null } });
    await expect(listTripsPage({ state: 'todos' })).rejects.toThrow('no contiene una lista válida');
  });
});
