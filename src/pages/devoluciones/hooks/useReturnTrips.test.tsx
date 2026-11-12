// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReturnTrip, TripFilter } from '../../../lib/devoluciones/types';
import { useReturnTrips } from './useReturnTrips';

const api = vi.hoisted(() => ({ getSummary: vi.fn(), listTrips: vi.fn(), listTripsPage: vi.fn() }));
vi.mock('../api/devolucionesApi', () => api);
const trip = (id: string): ReturnTrip => ({
  route_id: id, route_number: id, route_date: '2026-11-12', plan_trip_id: null, route_status: 'completed',
  carrier_name: null, driver_name: null, country_id: 'cr', total_returns: 1, received_returns: 0,
  pending_returns: 1, last_return_at: null, forms_count: 0,
});
type Page = { trips: ReturnTrip[]; nextCursor: string | null };
const deferred = () => {
  let resolve!: (value: Page) => void;
  const promise = new Promise<Page>((done) => { resolve = done; });
  return { promise, resolve };
};
const open = () => renderHook(({ state }) => useReturnTrips(state, '', ''), { initialProps: { state: 'pendientes' as TripFilter } });

beforeEach(() => {
  vi.resetAllMocks();
  api.getSummary.mockResolvedValue({ trips: 2, trips_pending: 2, trips_ready: 0, returns_total: 2, returns_pending: 2, returns_received: 0 });
  api.listTrips.mockResolvedValue([trip('first')]);
  api.listTripsPage.mockResolvedValue({ trips: [trip('first')], nextCursor: 'next' });
});
afterEach(cleanup);

describe('páginas de viajes con devoluciones', () => {
  it('cambiar de país reinicia el cursor y descarta una página del país anterior', async () => {
    const { result, rerender } = renderHook(({ countryId }) => useReturnTrips('todos', '', '', countryId), {
      initialProps: { countryId: 'country-a' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred();
    api.listTripsPage.mockReturnValueOnce(pending.promise);
    act(() => { void result.current.loadMore(); });
    expect(api.listTripsPage).toHaveBeenLastCalledWith({ state: 'todos', from: '', to: '', countryId: 'country-a' }, 'next');
    api.listTripsPage.mockResolvedValueOnce({ trips: [trip('country-b-trip')], nextCursor: 'country-b-next' });
    rerender({ countryId: 'country-b' });
    await waitFor(() => expect(result.current.trips[0]?.route_id).toBe('country-b-trip'));
    await act(async () => pending.resolve({ trips: [trip('country-a-stale')], nextCursor: 'old' }));
    expect(api.getSummary).toHaveBeenLastCalledWith('country-b');
    expect(result.current.trips.map(item => item.route_id)).toEqual(['country-b-trip']);
    api.listTripsPage.mockResolvedValueOnce({ trips: [], nextCursor: null });
    await act(async () => result.current.loadMore());
    expect(api.listTripsPage).toHaveBeenLastCalledWith({ state: 'todos', from: '', to: '', countryId: 'country-b' }, 'country-b-next');
  });
  it('agrega la página siguiente sin duplicar viajes y detecta el final', async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);
    api.listTripsPage.mockResolvedValueOnce({ trips: [trip('first'), trip('second')], nextCursor: null });
    await act(async () => result.current.loadMore());
    expect(result.current.trips.map((item) => item.route_id)).toEqual(['first', 'second']);
    expect(result.current.hasMore).toBe(false);
    expect(api.getSummary).toHaveBeenCalledTimes(1);
    expect(api.listTripsPage).toHaveBeenLastCalledWith({ state: 'pendientes', from: '', to: '' }, 'next');
  });

  it('dos clics mientras carga solicitan la página una sola vez', async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred();
    api.listTripsPage.mockReturnValueOnce(pending.promise);
    act(() => { void result.current.loadMore(); void result.current.loadMore(); });
    expect(api.listTripsPage).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve({ trips: [trip('second')], nextCursor: null }));
    expect(result.current.loadingMore).toBe(false);
  });

  it('cambiar de pestaña descarta una página anterior todavía en vuelo', async () => {
    const { result, rerender } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred();
    api.listTripsPage.mockReturnValueOnce(pending.promise);
    act(() => { void result.current.loadMore(); });
    api.listTripsPage.mockResolvedValueOnce({ trips: [trip('new-filter')], nextCursor: null });
    rerender({ state: 'recibidos' });
    await waitFor(() => expect(result.current.trips[0]?.route_id).toBe('new-filter'));
    await act(async () => pending.resolve({ trips: [trip('stale')], nextCursor: 'stale-next' }));
    expect(result.current.trips.map((item) => item.route_id)).toEqual(['new-filter']);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it('la recarga tras recibir reinicia el cursor y descarta la página vieja', async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred();
    api.listTripsPage.mockReturnValueOnce(pending.promise);
    act(() => { void result.current.loadMore(); });
    api.listTripsPage.mockResolvedValueOnce({ trips: [trip('after-receive')], nextCursor: 'fresh-next' });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.trips[0]?.route_id).toBe('after-receive'));
    await act(async () => pending.resolve({ trips: [trip('stale')], nextCursor: null }));
    api.listTripsPage.mockResolvedValueOnce({ trips: [], nextCursor: null });
    await act(async () => result.current.loadMore());
    expect(api.listTripsPage).toHaveBeenLastCalledWith({ state: 'pendientes', from: '', to: '' }, 'fresh-next');
    expect(result.current.trips.map((item) => item.route_id)).toEqual(['after-receive']);
  });

  it('un error al cargar más conserva las filas y permite reintentar el mismo cursor', async () => {
    const { result } = open();
    await waitFor(() => expect(result.current.loading).toBe(false));
    api.listTripsPage.mockRejectedValueOnce(new Error('Red no disponible'));
    await act(async () => result.current.loadMore());
    expect(result.current.trips).toEqual([trip('first')]);
    expect(result.current.loadMoreError).toBe('Red no disponible');
    expect(result.current.hasMore).toBe(true);
    api.listTripsPage.mockResolvedValueOnce({ trips: [trip('second')], nextCursor: null });
    await act(async () => result.current.loadMore());
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.trips.map((item) => item.route_id)).toEqual(['first', 'second']);
  });

  it('cambiar fechas descarta la primera carga vieja y envía el nuevo periodo', async () => {
    const pending = deferred();
    api.listTripsPage.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ from }) => useReturnTrips('todos', from, ''), { initialProps: { from: '' } });
    api.listTripsPage.mockResolvedValueOnce({ trips: [trip('new-period')], nextCursor: null });
    rerender({ from: '2026-11-01' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => pending.resolve({ trips: [trip('stale-period')], nextCursor: 'stale' }));
    expect(result.current.trips.map((item) => item.route_id)).toEqual(['new-period']);
    expect(api.listTripsPage).toHaveBeenLastCalledWith({ state: 'todos', from: '2026-11-01', to: '' });
    expect(result.current.hasMore).toBe(false);
  });
});
