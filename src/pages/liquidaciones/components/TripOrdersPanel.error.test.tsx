// @vitest-environment jsdom
//
// Si el servidor rechaza la marca de un pedido, el panel muestra el motivo real y no un mensaje genérico.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TripOrdersPanel from './TripOrdersPanel';
import { setOrderMark } from '../../../lib/tarifas/tripsDataSource';

vi.mock('../../../lib/tarifas/tripsDataSource', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/tarifas/tripsDataSource')>();
  return { ...real, setOrderMark: vi.fn(real.setOrderMark) };
});
const mark = vi.mocked(setOrderMark);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('TripOrdersPanel · error al marcar', () => {
  it('muestra el motivo que devolvió el servidor', async () => {
    mark.mockResolvedValueOnce({ error: 'Tu rol no puede marcar pedidos de este viaje.' } as Awaited<ReturnType<typeof setOrderMark>>);
    render(
      <MemoryRouter>
        <TripOrdersPanel trip={{ id: 'TRIP_RT_VE_A1', countryId: 'VE' }} currency="VES" editable />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('PED-1003')).toBeTruthy());
    const row = screen.getByText('PED-1003').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('Liquidar después'));

    await waitFor(() => expect(screen.getByText(/Tu rol no puede marcar pedidos de este viaje\./)).toBeTruthy());
    expect(screen.queryByText('Error al cambiar la marca del pedido')).toBeNull();
  });
});
