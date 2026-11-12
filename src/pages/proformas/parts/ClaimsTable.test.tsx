// @vitest-environment jsdom
//
// Reclamos: el error de decidir se ve DENTRO del modal (antes quedaba en un aviso tapado por el fondo) y "Reiniciar"
// explica que anula la proforma.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decideProforma, type ClaimRow } from '../../../lib/tarifas/proformas';
import ClaimsTable from './ClaimsTable';

vi.mock('../../../lib/tarifas/proformas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tarifas/proformas')>()),
  decideProforma: vi.fn(),
}));
const decide = vi.mocked(decideProforma);

const row = {
  proforma: { id: 'P1', number: 'PF-001', carrierId: 'C1', carrierName: 'Transportes SA', currency: 'CRC', totalAmount: 1000 },
  phases: [],
  claim: {
    id: 'K1', status: 'abierto', phaseName: 'Contabilidad', raisedBy: 'Ana', raisedRole: 'Contador', reason: 'Monto mal',
    createdAt: '2026-10-17T00:30:00Z', appealReason: null, appealedBy: null,
  },
} as unknown as ClaimRow;

const onChanged = vi.fn();

function open() {
  render(<MemoryRouter><ClaimsTable rows={[row]} loading={false} onOpen={vi.fn()} onChanged={onChanged} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Extender' }));
}

beforeEach(() => { decide.mockReset(); onChanged.mockReset(); });
afterEach(cleanup);

describe('ClaimsTable', () => {
  it('"Reiniciar liquidación" avisa que anula la proforma', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar liquidación/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/anula la proforma PF-001/)).toBeTruthy();
  });

  it('si decidir falla, el modal sigue abierto con el motivo del error y no recarga la lista', async () => {
    decide.mockResolvedValue({ error: 'Tu rol no puede reiniciar este reclamo.' });
    open();
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar liquidación/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reiniciar' }));

    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe('Tu rol no puede reiniciar este reclamo.'));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('si decidir sale bien cierra el modal, avisa y recarga', async () => {
    decide.mockResolvedValue({ error: null });
    open();
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar liquidación/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reiniciar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/PF-001 anulada/)).toBeTruthy();
  });

  it('la fecha del reclamo se muestra en la hora local, no la de UTC', () => {
    vi.stubEnv('TZ', 'America/Costa_Rica');
    open();
    // 00:30 UTC del día 17 = 18:30 del día 16 en Costa Rica.
    expect(screen.getByText(/«Contabilidad», 2026-10-16:/)).toBeTruthy();
    vi.unstubAllEnvs();
  });
});
