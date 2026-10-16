// @vitest-environment jsdom
//
// Liquidar varios viajes: una fila por viaje, cada una desplegable con el cuerpo del modal de un viaje,
// y un solo botón para emitirlos.

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

let trips: TripRecord[];

const renderLote = (onEmitted = vi.fn(), onClose = vi.fn()) => {
  render(
    <MemoryRouter>
      <LiquidarLoteModal trips={trips} onClose={onClose} onEmitted={onEmitted} />
    </MemoryRouter>,
  );
  return { onEmitted, onClose };
};

beforeEach(async () => {
  localStorage.clear();
  const all = await listTrips();
  trips = all.filter((t) => !notLiquidableReason(t) && tripProgress(t).complete).slice(0, 2);
  expect(trips).toHaveLength(2);
});
afterEach(cleanup);

describe('LiquidarLoteModal', () => {
  it('lista un viaje por fila, plegados, y ofrece emitir los dos', async () => {
    renderLote();
    for (const t of trips) expect(screen.getByText(t.routeNumber)).toBeTruthy();
    expect(screen.queryByText('Ver más: pedidos, devoluciones y desglose')).toBeNull();
    await waitFor(() => expect(screen.getByText('Emitir 2 liquidaciones')).toBeTruthy());
  });

  it('al desplegar un viaje aparece lo mismo que en el modal de un viaje', async () => {
    renderLote();
    await waitFor(() => expect(screen.getByText('Emitir 2 liquidaciones')).toBeTruthy());
    fireEvent.click(screen.getByText(trips[0].routeNumber));
    await waitFor(() => expect(screen.getByText('Total a pagar')).toBeTruthy());
    expect(screen.getByText(/Ver más: pedidos, devoluciones y desglose/)).toBeTruthy();
  });

  it('emite todos de una vez, avisa con las liquidaciones y cierra', async () => {
    const { onEmitted, onClose } = renderLote();
    await waitFor(() => expect(screen.getByText('Emitir 2 liquidaciones')).toBeTruthy());
    fireEvent.click(screen.getByText('Emitir 2 liquidaciones'));
    await waitFor(() => expect(onEmitted).toHaveBeenCalledTimes(1));
    const [saved, todas] = onEmitted.mock.calls[0] as [SettlementRecord[], boolean];
    expect(saved.map((s) => s.tripId).sort()).toEqual(trips.map((t) => t.id).sort());
    expect(todas).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });
});
