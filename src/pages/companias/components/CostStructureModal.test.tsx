// @vitest-environment jsdom
//
// La ficha de una compañía tiene que mostrar la estructura de costos que realmente se liquida: la
// propia, o —si no tiene— la del país cargada en Costos Flota → Estructura del país.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CostStructureModal from './CostStructureModal';
import { activeStructure, listRows } from '../../../lib/tarifas/costStructureDataSource';
import type { CarrierProfile } from '../../../lib/tarifas/parties';

vi.mock('../../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ canCreate: true, canEdit: true, canDelete: true, canView: true }),
}));

// El modal registra en la bitácora con el usuario real: sin AuthProvider, useAuth lanzaría.
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ appUser: { full_name: 'Auditor de prueba', email: 'auditor@example.com' } }),
}));

const profile = (classification: 'OWN' | 'OUTSOURCED'): CarrierProfile => ({
  carrierId: 'CARRIER_VE_1', code: 'C1', name: 'Transportes Uno', taxId: null, countryId: 'VE',
  classification, carrierStatus: 'active', partyId: 'CARRIER_VE_1', profileStatus: 'active',
});

const renderModal = (party: CarrierProfile) => render(
  <MemoryRouter>
    <CostStructureModal isOpen party={party} currency="VES" onClose={() => {}} />
  </MemoryRouter>,
);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('CostStructureModal: estructura heredada del país', () => {
  it('flota propia sin estructura propia: muestra la del país y dice que es la que se liquida', async () => {
    renderModal(profile('OWN'));
    await waitFor(() => expect(screen.getByText(/usa la estructura de costos del país/i)).toBeTruthy());
    expect(screen.getByText(/Crear una propia a partir de la del país/)).toBeTruthy();
    // Los conceptos del país se ven, en solo lectura (sin botón de editar).
    const pais = (await activeStructure(null, 'VE'))!;
    const filas = await listRows(pais.id);
    expect(screen.getByText(filas[0].label)).toBeTruthy();
    expect(screen.queryByTitle('Editar')).toBeNull();
  });

  it('un tercero la ve solo como referencia', async () => {
    renderModal(profile('OUTSOURCED'));
    await waitFor(() => expect(screen.getByText(/solo referencia/i)).toBeTruthy());
    expect(screen.getByText(/Los terceros no se liquidan con ella/)).toBeTruthy();
    expect(screen.queryByText(/Crear una propia/)).toBeNull();
  });

  it('copiar la del país crea una propia con los mismos conceptos y se puede editar', async () => {
    renderModal(profile('OWN'));
    await waitFor(() => expect(screen.getByText(/Crear una propia a partir de la del país/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Crear una propia a partir de la del país/));

    await waitFor(() => expect(screen.queryByText(/usa la estructura de costos del país/i)).toBeNull());
    const propia = (await activeStructure('CARRIER_VE_1'))!;
    const pais = (await activeStructure(null, 'VE'))!;
    expect((await listRows(propia.id)).map((r) => r.code)).toEqual((await listRows(pais.id)).map((r) => r.code));
    expect(screen.getAllByTitle('Editar').length).toBeGreaterThan(0);
  });

  it('no deja agregar un concepto suelto que taparía a la del país', async () => {
    renderModal(profile('OWN'));
    await waitFor(() => expect(screen.getByText(/usa la estructura de costos del país/i)).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('Salario del chofer'), { target: { value: 'Peaje' } });
    fireEvent.click(screen.getByText('Agregar'));
    await waitFor(() => expect(screen.getByText(/Antes de agregar conceptos/)).toBeTruthy());
    expect(await activeStructure('CARRIER_VE_1')).toBeNull();
  });
});
