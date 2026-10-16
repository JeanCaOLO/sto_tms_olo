// @vitest-environment jsdom
//
// Caracterización del modal de liquidar: el HTML de la vista simple y de la extendida se grabó ANTES
// de partir el archivo y no debe editarse a mano. Cubre además el cierre y la acción de emitir.

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
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ appUser: { full_name: 'Auditor de prueba', email: 'auditor@example.com' } }),
}));

let trip: TripRecord;
const onClose = vi.fn();
const onSaved = vi.fn();

const renderModal = () => render(
  <MemoryRouter>
    <LiquidarViajeModal isOpen trip={trip} settlement={null} onClose={onClose} onSaved={onSaved} />
  </MemoryRouter>,
);
const html = () => document.body.innerHTML.replace(/_r_[0-9a-z]+_/g, '_r_ID_');

beforeEach(async () => {
  localStorage.clear();
  puedeConfigurar = false;
  onClose.mockClear();
  onSaved.mockClear();
  trip = (await getTrip('TRIP_RT_VE_A1'))!;
});
afterEach(cleanup);

describe('LiquidarViajeModal (caracterización)', () => {
  it('vista simple', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Total a pagar')).toBeTruthy());
    expect(html()).toMatchSnapshot();
  });

  it('vista extendida', async () => {
    puedeConfigurar = true;
    renderModal();
    await waitFor(() => expect(screen.getByText('Vista extendida')).toBeTruthy());
    fireEvent.click(screen.getByText('Vista extendida'));
    await waitFor(() => expect(screen.getByText('PED-1001')).toBeTruthy());
    expect(html()).toMatchSnapshot();
  });

  it('en la extendida, excluir un renglón del desglose cambia el total', async () => {
    puedeConfigurar = true;
    renderModal();
    await waitFor(() => expect(screen.getByText('Vista extendida')).toBeTruthy());
    fireEvent.click(screen.getByText('Vista extendida'));
    await waitFor(() => expect(screen.getByText('PED-1001')).toBeTruthy());
    const antes = html();
    const casillas = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    expect(casillas.length).toBeGreaterThan(0);
    fireEvent.click(casillas[0]!);
    await waitFor(() => expect(html()).not.toBe(antes));
  });

  it('emitir guarda la liquidación, avisa y cierra', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Total a pagar')).toBeTruthy());
    fireEvent.click(screen.getByText('Emitir liquidación'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
