// @vitest-environment jsdom
// Lista de viajes: los KPI filtran TODOS los viajes del indicador (no solo los 30 cargados) y "Cargar más" depende de
// lo que dice el servidor (`next_cursor`), no de adivinar por la cantidad de filas.
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTrackingTransport, type TrackingTransport } from '../api';
import type { Resumen, Viaje, ViajesPage } from '../types';

vi.mock('../../../lib/supabase', () => ({ apiFetch: vi.fn() }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ canCreate: false, canEdit: false, canDelete: false, canExport: false }),
}));
vi.mock('../hooks/useTrackingCountry', () => ({ useTrackingCountry: () => null }));
vi.mock('../components/FlotaMapa', () => ({ default: () => <div data-testid="mapa" /> }));

import TrackingPage from '../page';
import { apiFetch } from '../../../lib/supabase';

// Dibujar 30 a 100 tarjetas por consulta es lento con toda la suite corriendo en paralelo: más margen que el 1 s por defecto.
configure({ asyncUtilTimeout: 8_000 });
vi.setConfig({ testTimeout: 20_000 });

function viaje(n: number, late: boolean): Viaje {
  const id = String(n).padStart(3, '0');
  return {
    id: `id-${id}`, route_number: `VJ-${id}`, state: 'active', phase: 'en_ruta', signal: 'online', color: 'green',
    driver_name: `Chofer ${id}`, plate: `P${id}`, zone_name: null, country: 'CR', timezone: 'America/Costa_Rica',
    started_at: '2026-11-02T14:00:00Z', ended_at: null, planned_end_at: null, route_date: '2026-11-02',
    due_date: '2026-11-02', assigned_at: null, days_late: late ? 1 : 0, position: null,
    progress: { total: 4, done: 1, delivered: 1, failed: 0, percent: 25 }, delay_min: null,
    alerts: late ? [{ code: 'late' }] : [], presence: null,
  };
}

/** Backend mínimo: `total` viajes activos, los primeros `late` retrasados; atiende `limit` y `next_cursor`. */
function fakeBackend(total: number, late: number) {
  const all = Array.from({ length: total }, (_, i) => viaje(i + 1, i < late));
  const requests: { limit: number; summary: boolean }[] = [];
  const summary: Resumen = {
    active: total, on_time: total - late, late, no_signal: 0, completed_today: 0,
    deliveries_total: total * 4, deliveries_done: total, deliveries_remaining: total * 3,
  };
  const transport: TrackingTransport = async (path) => {
    if (path.startsWith('/v1/tracking/choferes')) return { ok: true, status: 200, body: { data: [] } };
    const params = new URLSearchParams(path.split('?')[1] ?? '');
    const limit = Number(params.get('limit'));
    requests.push({ limit, summary: params.get('include') === 'summary' });
    const page: ViajesPage = {
      items: all.slice(0, limit),
      next_cursor: all.length > limit ? `cursor-${limit}` : null,
      summary,
    };
    return { ok: true, status: 200, body: { data: page } };
  };
  return { transport, requests };
}

const cards = () => screen.queryAllByText(/^VJ-\d{3}$/);
const loadMore = () => screen.queryByRole('button', { name: 'Cargar más' });
const kpi = (name: RegExp) => screen.getByRole('button', { name });

function mount(total: number, late: number) {
  const backend = fakeBackend(total, late);
  setTrackingTransport(backend.transport);
  render(<TrackingPage />);
  return backend;
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
afterAll(() => setTrackingTransport(apiFetch));

describe('TrackingPage · KPI con más viajes que una página', () => {
  it('"Retrasados" muestra los 35 retrasados aunque solo 30 viajes estaban cargados', async () => {
    const { requests } = mount(40, 35);
    await waitFor(() => expect(cards()).toHaveLength(30)); // primera página
    expect(requests[0].limit).toBe(30);

    fireEvent.click(kpi(/Retrasados/));
    await waitFor(() => expect(cards()).toHaveLength(35));
    expect(requests.some((r) => r.limit === 100)).toBe(true);
    expect(loadMore()).toBeNull(); // con un KPI no se pagina
    expect(screen.queryByText(/Mostrando 35 de/)).toBeNull(); // están todos: sin aviso
  });

  it('avisa "X de Y" cuando el indicador tiene más viajes de los que se pueden cargar', async () => {
    mount(120, 120);
    await waitFor(() => expect(cards()).toHaveLength(30));

    fireEvent.click(kpi(/Retrasados/));
    await waitFor(() => expect(cards()).toHaveLength(100));
    expect(screen.getByText(/Mostrando 100 de 120/)).toBeTruthy();
  });

  it('quitar el KPI vuelve a la primera página', async () => {
    mount(40, 35);
    await waitFor(() => expect(cards()).toHaveLength(30));
    fireEvent.click(kpi(/Retrasados/));
    await waitFor(() => expect(cards()).toHaveLength(35));

    fireEvent.click(kpi(/Retrasados/));
    await waitFor(() => expect(cards()).toHaveLength(30));
    expect(loadMore()).not.toBeNull();
  });
});

describe('TrackingPage · Cargar más', () => {
  it('con exactamente una página y sin next_cursor no ofrece "Cargar más"', async () => {
    mount(30, 0);
    await waitFor(() => expect(cards()).toHaveLength(30));
    expect(loadMore()).toBeNull();
  });

  it('con next_cursor ofrece "Cargar más", trae el resto y el botón desaparece', async () => {
    const { requests } = mount(45, 0);
    await waitFor(() => expect(cards()).toHaveLength(30));
    expect(loadMore()).not.toBeNull();

    fireEvent.click(loadMore()!);
    await waitFor(() => expect(cards()).toHaveLength(45));
    expect(requests.some((r) => r.limit === 60)).toBe(true);
    await waitFor(() => expect(loadMore()).toBeNull());
  });

  it('al llegar al tope de 100 con más viajes avisa y manda a la búsqueda', async () => {
    mount(150, 0);
    await waitFor(() => expect(cards()).toHaveLength(30));
    for (const expected of [60, 90, 100]) {
      fireEvent.click(loadMore()!);
      await waitFor(() => expect(cards()).toHaveLength(expected));
    }
    expect(loadMore()).toBeNull();
    expect(screen.getByText(/Mostrando los 100 viajes más recientes/)).toBeTruthy();
  }, 20_000); // dibuja hasta 100 tarjetas varias veces: con la suite completa en paralelo pasa de los 5 s por defecto
});
