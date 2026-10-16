// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TripOrdersPanel from './TripOrdersPanel';

const trip = { id: 'TRIP_RT_VE_A1', countryId: 'VE' };

const renderPanel = (editable: boolean) => render(
  <MemoryRouter>
    <TripOrdersPanel trip={trip} currency="VES" editable={editable} />
  </MemoryRouter>,
);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('TripOrdersPanel', () => {
  it('lista los pedidos del viaje con su estado de entrega y avisa los que faltan', async () => {
    renderPanel(false);
    await waitFor(() => expect(screen.getByText('PED-1001')).toBeTruthy());
    expect(screen.getByText('PED-1003')).toBeTruthy();
    expect(screen.getAllByText('Entregado')).toHaveLength(2);
    expect(screen.getByText('Pendiente')).toBeTruthy();
    expect(screen.getByText(/1 pedido sin entregar/)).toBeTruthy();
    // Solo lectura: no hay acciones.
    expect(screen.queryByText('Liquidar después')).toBeNull();
  });

  it('deja un pedido para liquidar después y luego lo vuelve a incluir', async () => {
    renderPanel(true);
    await waitFor(() => expect(screen.getByText('PED-1003')).toBeTruthy());
    const row = () => screen.getByText('PED-1003').closest('tr') as HTMLElement;

    fireEvent.click(within(row()).getByText('Liquidar después'));
    await waitFor(() => expect(within(row()).getAllByText('Liquidar después').length).toBeGreaterThan(0));
    await waitFor(() => expect(within(row()).getByText('Incluir')).toBeTruthy());

    fireEvent.click(within(row()).getByText('Incluir'));
    await waitFor(() => expect(within(row()).queryByText('Incluir')).toBeNull());
  });

  it('anular pide un motivo antes de confirmar', async () => {
    renderPanel(true);
    await waitFor(() => expect(screen.getByText('PED-1002')).toBeTruthy());
    const row = () => screen.getByText('PED-1002').closest('tr') as HTMLElement;

    fireEvent.click(within(row()).getByTitle('Sacar el pedido del reparto'));
    const confirmar = within(row()).getByText('Anular') as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(within(row()).getByLabelText('Motivo de la anulación'), { target: { value: 'duplicado' } });
    expect((within(row()).getByText('Anular') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(row()).getByText('Anular'));

    await waitFor(() => expect(within(row()).getByText('duplicado')).toBeTruthy());
    expect(within(row()).getByText('Anulado')).toBeTruthy();
  });
});
