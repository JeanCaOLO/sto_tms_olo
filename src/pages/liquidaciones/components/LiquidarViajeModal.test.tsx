// @vitest-environment jsdom
//
// El modal de liquidar: vista simple por defecto, con el detalle detrás de "Ver más" (en un cuadro
// con scroll interno), y los pedidos del viaje con su marca.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LiquidarViajeModal from './LiquidarViajeModal';
import { getTrip } from '../../../lib/tarifas/tripsDataSource';
import type { TripRecord } from '../../../lib/tarifas/types';

let puedeConfigurar = false;
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => puedeConfigurar }),
}));

let trip: TripRecord;

const renderModal = () => render(
  <MemoryRouter>
    <LiquidarViajeModal isOpen trip={trip} onClose={() => {}} onSaved={() => {}} />
  </MemoryRouter>,
);

beforeEach(async () => {
  localStorage.clear();
  puedeConfigurar = false;
  trip = (await getTrip('TRIP_RT_VE_A1'))!;
});
afterEach(cleanup);

describe('LiquidarViajeModal', () => {
  it('por defecto es simple: total y emitir, con el detalle plegado', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Total a pagar')).toBeTruthy());
    expect(screen.getByText(/Ver más: pedidos, devoluciones y desglose/)).toBeTruthy();
    // El detalle no está hasta pedirlo.
    expect(screen.queryByText('PED-1001')).toBeNull();
    expect(screen.queryByText('Por qué este total')).toBeNull();
    // Quien solo liquida no ve el interruptor de vista.
    expect(screen.queryByText('Vista extendida')).toBeNull();
  });

  it('"Ver más" muestra pedidos, desglose y devoluciones en un cuadro con scroll interno', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText(/Ver más/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Ver más: pedidos, devoluciones y desglose/));

    await waitFor(() => expect(screen.getByText('PED-1001')).toBeTruthy());
    expect(screen.getByText('Por qué este total')).toBeTruthy();
    expect(screen.getByText(/Solo informativas/)).toBeTruthy();
    const caja = screen.getByText('Pedidos del viaje').closest('div.overflow-y-auto');
    expect(caja).not.toBeNull();

    fireEvent.click(screen.getByText('Ver menos'));
    expect(screen.queryByText('PED-1001')).toBeNull();
  });

  it('quien configura puede pasar a la vista extendida, que muestra los pedidos sin pedirlos', async () => {
    puedeConfigurar = true;
    renderModal();
    await waitFor(() => expect(screen.getByText('Vista extendida')).toBeTruthy());
    expect(screen.queryByText('PED-1001')).toBeNull(); // arranca simple
    fireEvent.click(screen.getByText('Vista extendida'));
    await waitFor(() => expect(screen.getByText('PED-1001')).toBeTruthy());
    expect(screen.getByText('3 · Pedidos del viaje')).toBeTruthy();
  });

  it('el cuerpo del modal hace scroll por dentro, con encabezado y pie fijos', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Total a pagar')).toBeTruthy());
    expect(document.querySelector('.flex-1.overflow-y-auto')).not.toBeNull();
    expect(screen.getByText('Emitir liquidación')).toBeTruthy();
  });
});
