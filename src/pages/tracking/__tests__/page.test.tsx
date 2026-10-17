// @vitest-environment jsdom
// Página completa contra el backend simulado: lo que se ve al cambiar de viaje y qué se le pide al API.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setTrackingTransport, type TrackingTransport } from '../api';
import { createFakeTrackingBackend } from '../mock/fakeTrackingBackend';
import { resetSimulation, setRoadProvider, simNow } from '../mock/sim';

vi.mock('../../../lib/supabase', () => ({ apiFetch: vi.fn() }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ canCreate: false, canEdit: false, canDelete: false, canExport: false }),
}));
vi.mock('../hooks/useTrackingCountry', () => ({ useTrackingCountry: () => null }));
// Leaflet no corre en jsdom: el mapa se reemplaza por un marcador de posición.
vi.mock('../components/FlotaMapa', () => ({ default: () => <div data-testid="mapa" /> }));

import TrackingPage from '../page';
import { apiFetch } from '../../../lib/supabase';

const paths: string[] = [];

beforeAll(() => {
  setRoadProvider(null);
  resetSimulation();
  const fake = createFakeTrackingBackend({ latencyMs: 0 });
  const spy: TrackingTransport = (path, init) => { paths.push(path); return fake(path, init); };
  setTrackingTransport(spy, simNow);
});
afterEach(cleanup);
afterAll(() => setTrackingTransport(apiFetch));

const panel = () => screen.getByRole('complementary', { name: /^VJ-DEMO/ });

describe('TrackingPage (modo mock)', () => {
  it('al cambiar de viaje el panel nunca muestra los pedidos del anterior', async () => {
    render(<TrackingPage />);
    fireEvent.click(await screen.findByText('VJ-DEMO-CR-01'));
    await within(panel()).findByText('Abastos El Progreso');

    fireEvent.click(screen.getByText('VJ-DEMO-CR-03'));
    expect(panel().getAttribute('aria-label')).toBe('VJ-DEMO-CR-03');
    expect(within(panel()).queryByText('Abastos El Progreso')).toBeNull(); // ni un instante con lo de CR-01
    await waitFor(() => expect(within(panel()).queryByText('Cargando...')).toBeNull());
    expect(within(panel()).queryByText('Abastos El Progreso')).toBeNull();
  });

  it('una sola llamada trae lista y KPIs, y sin selección nunca pide /viajes/null', async () => {
    paths.length = 0;
    render(<TrackingPage />);
    await screen.findByText('VJ-DEMO-CR-01');
    expect(screen.getByRole('group', { name: 'Resumen de viajes' }).textContent).toMatch(/En ruta\d+/);
    expect(paths.some((p) => p.includes('include=summary'))).toBe(true);
    expect(paths.some((p) => p.includes('/resumen'))).toBe(false);
    expect(paths.some((p) => p.includes('/viajes/null'))).toBe(false);
  });

  it('un KPI filtra la lista y cierra el viaje abierto', async () => {
    render(<TrackingPage />);
    fireEvent.click(await screen.findByText('VJ-DEMO-CR-01'));
    await within(panel()).findByText('Abastos El Progreso');
    fireEvent.click(screen.getByRole('button', { name: /Sin señal/ }));
    expect(screen.queryByRole('complementary', { name: /^VJ-DEMO/ })).toBeNull();
    expect(screen.getByText('VJ-DEMO-CR-03')).toBeTruthy();
    expect(screen.queryByText('VJ-DEMO-CR-01')).toBeNull();
  });

  it('en mock muestra los controles de prueba; la acción de completar no existe', async () => {
    render(<TrackingPage />);
    await screen.findByText('VJ-DEMO-CR-01');
    expect(await screen.findByLabelText('Pausar simulación')).toBeTruthy();
    expect(screen.queryByText('Completar viaje')).toBeNull();
  });
});
