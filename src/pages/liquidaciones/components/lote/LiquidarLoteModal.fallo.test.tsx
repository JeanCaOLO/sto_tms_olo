// @vitest-environment jsdom
//
// Si un viaje del lote falla al emitir, los demás se emiten igual y el fallido queda abierto con su motivo.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LiquidarLoteModal from './LiquidarLoteModal';
import { listTrips } from '../../../../lib/tarifas/tripsDataSource';
import { notLiquidableReason } from '../../../../lib/tarifas/tripContext';
import { tripProgress } from '../../../../lib/tarifas/tripOrders';
import type { SettlementRecord, TripRecord } from '../../../../lib/tarifas/types';

vi.mock('../../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => false }),
}));

let failTripId = '';
vi.mock('../../api/liquidacionesApi', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/liquidacionesApi')>();
  return {
    ...real,
    emitNew: (input: Parameters<typeof real.emitNew>[0]) => (
      input.trip.id === failTripId
        ? Promise.resolve({ status: 'failed' as const, error: { message: 'La tarifa cambió, revisa el cálculo.' } })
        : real.emitNew(input)
    ),
  };
});

let trips: TripRecord[];

beforeEach(async () => {
  localStorage.clear();
  const all = await listTrips();
  trips = all.filter((t) => !notLiquidableReason(t) && tripProgress(t).complete).slice(0, 2);
  failTripId = trips[1].id;
});
afterEach(cleanup);

describe('LiquidarLoteModal con un viaje que falla', () => {
  it('emite el bueno, deja el fallido abierto con su error y no cierra', async () => {
    const onEmitted = vi.fn();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <LiquidarLoteModal trips={trips} onClose={onClose} onEmitted={onEmitted} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Emitir 2 liquidaciones')).toBeTruthy());
    fireEvent.click(screen.getByText('Emitir 2 liquidaciones'));

    await waitFor(() => expect(onEmitted).toHaveBeenCalledTimes(1));
    const [saved, todas] = onEmitted.mock.calls[0] as [SettlementRecord[], boolean];
    expect(saved).toHaveLength(1);
    expect(saved[0].tripId).toBe(trips[0].id);
    expect(todas).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('La tarifa cambió, revisa el cálculo.')).toBeTruthy());
    expect(screen.getByText(`Emitida ${saved[0].number}`)).toBeTruthy();
    expect(screen.getByText('Revisar')).toBeTruthy();
  });
});
