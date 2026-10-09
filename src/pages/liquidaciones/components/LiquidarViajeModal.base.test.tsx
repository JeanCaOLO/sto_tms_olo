// @vitest-environment jsdom
//
// "Cambiar base de cálculo" en el modal de liquidar: cerrado es una línea; al marcar el check aparecen
// los tipos de cobro (los que no tienen información, bloqueados y con su motivo), y al elegir uno se
// ve de dónde sale la base. Usa la semilla existente: ahí solo hay tarifa fija por tarifario; los demás
// tipos se prueban en baseMethods.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LiquidarViajeModal from './LiquidarViajeModal';
import { getTrip } from '../../../lib/tarifas/tripsDataSource';
import type { TripRecord } from '../../../lib/tarifas/types';

let esAdmin = false;
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => false, isAdmin: esAdmin }),
}));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ appUser: { organization_id: 'org-1', full_name: 'Admin Demo', email: 'a@demo.cr' } }),
}));

let trip: TripRecord;
const renderModal = () => render(
  <MemoryRouter>
    <LiquidarViajeModal isOpen trip={trip} onClose={() => {}} onSaved={() => {}} />
  </MemoryRouter>,
);

beforeEach(async () => {
  localStorage.clear();
  esAdmin = false;
  trip = (await getTrip('TRIP_RT_VE_A1'))!;
});
afterEach(cleanup);

const abrirSelector = async () => {
  renderModal();
  const check = await screen.findByLabelText('Cambiar base de cálculo');
  fireEvent.click(check);
  return check;
};

describe('Cambiar base de cálculo', () => {
  it('cerrado muestra solo en qué se basa hoy la base', async () => {
    renderModal();
    await screen.findByLabelText('Cambiar base de cálculo');
    expect(screen.getByText(/Se calcula con:/)).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('al marcar el check solo habilita lo que tiene información; el resto queda bloqueado con su motivo', async () => {
    await abrirSelector();
    expect((screen.getByRole('radio', { name: /Tarifa fija/ }) as HTMLButtonElement).disabled).toBe(false);
    for (const nombre of [/Por kilómetro/, /Por volumen/, /Por unidad/]) {
      const boton = screen.getByRole('radio', { name: nombre }) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);
      expect(boton.title).toBe('No hay información para este cálculo.');
    }
    const tendering = screen.getByRole('radio', { name: /Tendering/ }) as HTMLButtonElement;
    expect(tendering.disabled).toBe(true);
    expect(tendering.title).toBe('Todavía no tiene un cálculo definido.');
  });

  it('al elegir tarifa fija muestra de dónde sale la base y la marca como cambiada', async () => {
    await abrirSelector();
    fireEvent.click(screen.getByRole('radio', { name: /Tarifa fija/ }));
    await waitFor(() => expect(screen.getByText(/Este cálculo está basado en el tarifario ZONAS/)).toBeTruthy());
    expect(screen.getByText(/\(cambiada\)/)).toBeTruthy();
  });

  it('desmarcar el check vuelve a la base por defecto', async () => {
    const check = await abrirSelector();
    fireEvent.click(screen.getByRole('radio', { name: /Tarifa fija/ }));
    await waitFor(() => expect(screen.getByText(/\(cambiada\)/)).toBeTruthy());

    fireEvent.click(check);
    await waitFor(() => expect(screen.queryByText(/\(cambiada\)/)).toBeNull());
  });

  it('quien no es administrador no puede crear reglas', async () => {
    await abrirSelector();
    expect(screen.queryByText('Crear una regla de base')).toBeNull();
    expect(screen.getByText(/pida a un administrador/)).toBeTruthy();
  });

  it('el administrador ve el acceso para crear una regla de base', async () => {
    esAdmin = true;
    await abrirSelector();
    expect(screen.getByText('Crear una regla de base')).toBeTruthy();
  });
});
