// @vitest-environment jsdom
//
// La tarjeta "En revisión" cuenta todo lo vigente y la pestaña "En proceso" solo el periodo elegido (por defecto, hoy):
// cuando no coinciden, la pantalla lo dice y ofrece ver todas.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateRange, ProformaScope, ProformaWithPhases } from '../../lib/tarifas/proformas';

vi.mock('../../hooks/useActiveCountry', () => ({
  useActiveCountry: () => ({ country: { local_currency: 'CRC' }, countryId: 'CR', problem: null, selectedName: 'Costa Rica', loading: false }),
}));
vi.mock('../../hooks/use-module-permissions', () => ({
  useModulePermissions: () => ({ canView: true, canCreate: true, canEdit: true, canDelete: true }),
}));
vi.mock('../../hooks/useTarifasActor', () => ({ useTarifasActor: () => undefined }));
vi.mock('./hooks/useProformaActor', () => ({ useProformaActor: () => ({ roleName: 'SuperAdministrador', userId: 'u1' }) }));
vi.mock('./hooks/useGoogleReturn', () => ({ useGoogleReturn: () => ({ notice: null, dismiss: vi.fn() }) }));
vi.mock('./hooks/useClaims', () => ({ useClaims: () => ({ rows: [], loading: false, error: null, reload: vi.fn() }) }));
vi.mock('../../components/feature/CountryScopeBar', () => ({ default: () => null }));
vi.mock('./components/DetalleProformaModal', () => ({ default: () => null }));
vi.mock('./components/ProformaBitacora', () => ({ default: () => null }));
vi.mock('./config/EmailConfigForm', () => ({ default: () => null }));
vi.mock('./config/FlowPhasesEditor', () => ({ default: () => null }));
vi.mock('./parts/ClaimsTable', () => ({ default: () => null }));
vi.mock('./parts/CarrierGroupsTable', () => ({ default: () => <div data-testid="grupos" /> }));

const calls = vi.hoisted(() => ({ list: [] as { scope: ProformaScope; range?: DateRange }[] }));
const row = (id: string, status: string) => ({
  proforma: { id, number: `PF-${id}`, status, totalAmount: 100, carrierId: 'C', carrierName: 'T', currency: 'CRC', emailSentAt: null },
  phases: [],
}) as unknown as ProformaWithPhases;

vi.mock('./hooks/useProformaList', () => ({
  useProformaList: (_country: string, _sweep: boolean, scope: ProformaScope, range?: DateRange) => {
    calls.list.push({ scope, range });
    // Lo vigente: 5 en revisión. La sección "En proceso" del periodo (hoy): solo 1.
    const rows = scope === 'active'
      ? [row('1', 'En Revisión'), row('2', 'En Revisión'), row('3', 'En Revisión'), row('4', 'En Revisión'), row('5', 'En Revisión')]
      : range?.preset === 'all'
        ? [row('1', 'En Revisión'), row('2', 'En Revisión'), row('3', 'En Revisión'), row('4', 'En Revisión'), row('5', 'En Revisión')]
        : [row('1', 'En Revisión')];
    return { rows, loading: false, error: null, noPhases: false, reload: vi.fn() };
  },
}));

import ProformasPage from './page';

beforeEach(() => { calls.list.length = 0; });
afterEach(cleanup);

const open = () => render(<MemoryRouter><ProformasPage /></MemoryRouter>);

describe('Proformas · tarjeta "En revisión" y pestaña "En proceso"', () => {
  it('la tarjeta dice que cuenta todas', () => {
    open();
    expect(screen.getByText('En revisión (todas)')).toBeTruthy();
  });

  it('en "En proceso" avisa que hay más en revisión que las del periodo y ofrece verlas todas', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'En proceso' }));
    expect(screen.getByText(/Hay 5 en revisión en total; este periodo muestra 1\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(calls.list.some((c) => c.scope === 'review' && c.range?.preset === 'all')).toBe(true);
    // Con todas a la vista ya coinciden: el aviso desaparece.
    expect(screen.queryByText(/Hay 5 en revisión en total/)).toBeNull();
  });

  it('en otras pestañas no muestra ese aviso', () => {
    open();
    expect(screen.queryByText(/en revisión en total/)).toBeNull();
  });
});
