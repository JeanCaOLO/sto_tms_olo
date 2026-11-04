// @vitest-environment jsdom
// Vista del rol Cliente: solo SU entrega, con ETA, y el monitor general no se monta.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTrackingTransport, type TrackingTransport } from '../api';
import type { EntregaCliente } from '../types';

vi.mock('../../../lib/supabase', () => ({ apiFetch: vi.fn() }));
vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ canCreate: false, canEdit: false, canDelete: false, canExport: false }),
}));
vi.mock('../hooks/useTrackingCountry', () => ({ useTrackingCountry: () => null }));
let role = 'Cliente';
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ appUser: { role: { name: role } } }) }));
// Leaflet no corre en jsdom.
vi.mock('../components/MapaEntrega', () => ({ default: () => <div data-testid="mapa-entrega" /> }));
vi.mock('../components/FlotaMapa', () => ({ default: () => <div data-testid="mapa" /> }));

import TrackingPage from '../page';

const entrega = (over: Partial<EntregaCliente> = {}): EntregaCliente => ({
  id: 's1', status: 'en_camino', point_name: 'EPA Heredia', order_number: 'P-2', address: 'Calle 2', city: 'Heredia',
  lat: 9.95, lng: -84.05, planned_arrival_at: null, eta_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  distance_m: 3200, stops_ahead: 1, delivered_at: null, site_arrived_at: null, site_departed_at: null,
  dwell_seconds: null, truck: { lat: 9.9, lng: -84.1, recorded_at: new Date().toISOString(), signal: 'online' }, ...over,
});

const paths: string[] = [];
const serve = (items: EntregaCliente[]) => {
  const transport: TrackingTransport = async (path) => {
    paths.push(path);
    return { ok: true, status: 200, body: { data: { view: 'client', items }, error: null } };
  };
  setTrackingTransport(transport);
};

beforeEach(() => { paths.length = 0; role = 'Cliente'; });
afterEach(cleanup);

describe('Tracking del rol Cliente', () => {
  it('muestra solo su entrega con el tiempo estimado y el mapa, y no pide el monitor general', async () => {
    serve([entrega()]);
    render(<TrackingPage />);
    expect(await screen.findByText('EPA Heredia')).toBeTruthy();
    expect(screen.getByText(/llega en ~\d+ min/)).toBeTruthy();
    expect(await screen.findByTestId('mapa-entrega')).toBeTruthy();
    expect(paths.every((p) => p.endsWith('/mis-entregas'))).toBe(true);
  });

  it('una entrega ya entregada no muestra el mapa del camión', async () => {
    serve([entrega({ status: 'entregado', eta_at: null, truck: null, delivered_at: '2026-10-16T15:00:00Z', stops_ahead: null })]);
    render(<TrackingPage />);
    await waitFor(() => expect(screen.getByText(/Entregado a las/)).toBeTruthy());
    expect(screen.queryByTestId('mapa-entrega')).toBeNull();
  });

  it('sin entregas lo dice, sin errores', async () => {
    serve([]);
    render(<TrackingPage />);
    expect(await screen.findByText(/no tienes entregas/i)).toBeTruthy();
  });
});
