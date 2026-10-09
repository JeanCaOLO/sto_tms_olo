// @vitest-environment jsdom
//
// Caracterización de la tabla de compañías: HTML en flota propia y en terceros, y sus acciones por fila.
// Los snapshots se generaron ANTES de la partición y no deben editarse a mano.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompaniasTable } from './CompaniasTable';
import type { CarrierProfile, PartyClassification } from '../../../lib/tarifas/parties';

afterEach(cleanup);

const profile = (over: Partial<CarrierProfile>): CarrierProfile => ({
  carrierId: 'C1', code: 'TR-1', name: 'Transportes Uno', taxId: '3-101-000', countryId: 'CR',
  classification: 'OUTSOURCED', carrierStatus: 'active', partyId: 'P1', profileStatus: 'active', ...over,
} as CarrierProfile);

const DATA = [
  profile({}),
  profile({ carrierId: 'C2', code: 'TR-2', name: 'Sin cálculo', taxId: null, partyId: null, profileStatus: null }),
  profile({ carrierId: 'C3', code: 'TR-3', name: 'Dada de baja', partyId: 'P3', profileStatus: 'inactive' }),
];
const COUNTRIES = [{ id: 'CR', name: 'Costa Rica', local_currency: 'CRC' }];

function setup(classification: PartyClassification, extra: Partial<Parameters<typeof CompaniasTable>[0]> = {}) {
  const handlers = {
    onShowInactiveChange: vi.fn(), onToggleStatus: vi.fn(), onCostsClick: vi.fn(), onRatesClick: vi.fn(), onVariablesClick: vi.fn(),
  };
  const view = render(
    <MemoryRouter>
      <CompaniasTable
        classification={classification} data={DATA} loading={false} countries={COUNTRIES}
        canEdit showInactive={false} {...handlers} {...extra}
      />
    </MemoryRouter>,
  );
  return { ...view, ...handlers };
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('CompaniasTable (caracterización)', () => {
  it('terceros: muestra la identificación fiscal y oculta las desactivadas', () => {
    const { container } = setup('OUTSOURCED');
    expect(screen.getByText('Falta — se necesita para pagarle')).toBeTruthy();
    expect(screen.queryByText('Dada de baja')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('flota propia: sin columna de identificación fiscal y con las desactivadas visibles', () => {
    const { container } = setup('OWN', { showInactive: true });
    expect(screen.queryByText('Identificación fiscal')).toBeNull();
    expect(screen.getByText('Dada de baja')).toBeTruthy();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('cada acción llama a su manejador con la compañía de la fila', () => {
    const h = setup('OUTSOURCED');
    const row = rowOf('Transportes Uno');
    fireEvent.click(within(row).getByTitle('Estructura de costos de esta compañía'));
    fireEvent.click(within(row).getByTitle('Tarifarios: el precio de cada ruta'));
    fireEvent.click(within(row).getByTitle('Variables propias de esta compañía'));
    fireEvent.click(within(row).getByTitle('Desactivar cálculo'));
    expect(h.onCostsClick).toHaveBeenCalledWith(DATA[0]);
    expect(h.onRatesClick).toHaveBeenCalledWith(DATA[0]);
    expect(h.onVariablesClick).toHaveBeenCalledWith(DATA[0]);
    expect(h.onToggleStatus).toHaveBeenCalledWith(DATA[0]);
  });

  it('desactivar está bloqueado sin permiso o sin cálculo, y explica por qué', () => {
    setup('OUTSOURCED', { canEdit: false });
    const sinPermiso = within(rowOf('Transportes Uno')).getByTitle('Tu rol no puede desactivar compañías') as HTMLButtonElement;
    expect(sinPermiso.disabled).toBe(true);
    cleanup();

    setup('OUTSOURCED');
    const sinCalculo = within(rowOf('Sin cálculo')).getByTitle('Sin cálculo configurado: no hay nada que desactivar') as HTMLButtonElement;
    expect(sinCalculo.disabled).toBe(true);
  });

  it('una compañía desactivada ofrece reactivar', () => {
    setup('OUTSOURCED', { showInactive: true });
    expect(within(rowOf('Dada de baja')).getByTitle('Reactivar cálculo')).toBeTruthy();
  });

  it('el interruptor de desactivadas avisa del cambio', () => {
    const h = setup('OUTSOURCED');
    fireEvent.click(screen.getByLabelText('Ver desactivadas'));
    expect(h.onShowInactiveChange).toHaveBeenCalledWith(true);
  });
});
