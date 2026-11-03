// @vitest-environment jsdom
//
// Aprobar o rechazar en lote: el modal dice a cuántas proformas y a cuántos transportistas afecta antes de confirmar.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProformaWithPhases } from '../../../lib/tarifas/proformas';
import CarrierGroupsTable from './CarrierGroupsTable';

vi.mock('../hooks/useIrregularities', () => ({ useIrregularities: () => ({ alerts: new Map() }) }));

const row = (id: string, carrierId: string, carrierName: string) => ({
  proforma: { id, number: `PF-${id}`, carrierId, carrierName, currency: 'CRC', totalAmount: 500, status: 'En Revisión' },
  phases: [],
}) as unknown as ProformaWithPhases;

const rows = [row('1', 'A', 'Transportes Alfa'), row('2', 'A', 'Transportes Alfa'), row('3', 'B', 'Carga Beta')];

function selectAllAndAsk(button: string) {
  render(
    <MemoryRouter>
      <CarrierGroupsTable rows={rows} mode="approve" loading={false} onOpen={vi.fn()} onChanged={vi.fn()} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar las filas de esta página' }));
  fireEvent.click(screen.getByRole('button', { name: button }));
  return screen.getByRole('dialog');
}

afterEach(cleanup);

describe('CarrierGroupsTable · decisión en lote', () => {
  it('aprobar dice cuántas proformas y de qué transportistas', () => {
    const dialog = selectAllAndAsk('Aprobar seleccionados');
    expect(within(dialog).getByText(/3 proformas de 2 transportistas/)).toBeTruthy();
    expect(within(dialog).getByText(/Carga Beta, Transportes Alfa/)).toBeTruthy();
  });

  it('rechazar también lo dice', () => {
    const dialog = selectAllAndAsk('Rechazar');
    expect(within(dialog).getByText(/3 proformas de 2 transportistas/)).toBeTruthy();
  });

  it('con una sola proforma habla en singular', () => {
    render(
      <MemoryRouter>
        <CarrierGroupsTable rows={[row('9', 'C', 'Solo Uno')]} mode="approve" loading={false} onOpen={vi.fn()} onChanged={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marcar las filas de esta página' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar seleccionados' }));
    expect(within(screen.getByRole('dialog')).getByText(/1 proforma de 1 transportista/)).toBeTruthy();
  });
});
