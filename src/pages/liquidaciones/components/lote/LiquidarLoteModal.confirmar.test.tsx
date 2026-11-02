// @vitest-environment jsdom
//
// Emitir en lote: pide confirmar antes (son varias liquidaciones a la vez) y un error inesperado en un viaje no corta
// al resto ni deja sin avisar lo que ya se emitió.
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { confirmAction } from '../../../../lib/confirm';
import type { SettlementRecord, TripRecord } from '../../../../lib/tarifas/types';
import type { LoteItemHandle, LoteItemSummary } from './LoteViajeItem';
import LiquidarLoteModal from './LiquidarLoteModal';

vi.mock('../../../../lib/confirm', () => ({ confirmAction: vi.fn() }));
vi.mock('../../../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => false }) }));

const behavior = vi.hoisted(() => ({ emitir: {} as Record<string, () => Promise<unknown>> }));

// Cada viaje del lote es un componente con su propia lógica de emisión: aquí se reemplaza por uno controlable.
vi.mock('./LoteViajeItem', () => ({
  LoteViajeItem: forwardRef<LoteItemHandle, { trip: TripRecord; onReport: (id: string, s: LoteItemSummary) => void }>(
    function Fake({ trip, onReport }, ref) {
      useImperativeHandle(ref, () => ({ emitir: () => behavior.emitir[trip.id]() as Promise<SettlementRecord | null> }));
      useEffect(() => { onReport(trip.id, { total: '1000', currency: 'CRC', ready: true, saved: null }); }, [trip.id, onReport]);
      return <li>{trip.routeNumber}</li>;
    },
  ),
}));

const confirm = vi.mocked(confirmAction);
const trips = [
  { id: 'T1', routeNumber: 'RT-1' }, { id: 'T2', routeNumber: 'RT-2' }, { id: 'T3', routeNumber: 'RT-3' },
] as unknown as TripRecord[];
const saved = (tripId: string) => ({ id: `S-${tripId}`, tripId, number: `LIQ-${tripId}` }) as unknown as SettlementRecord;

const onEmitted = vi.fn();
const onClose = vi.fn();
const open = () => render(<LiquidarLoteModal trips={trips} onClose={onClose} onEmitted={onEmitted} />);
const emitirTodos = async () => {
  await waitFor(() => expect(screen.getByRole('button', { name: /Emitir 3 liquidaciones/ })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /Emitir 3 liquidaciones/ }));
};

beforeEach(() => {
  confirm.mockReset();
  onEmitted.mockReset();
  onClose.mockReset();
  behavior.emitir = {
    T1: vi.fn(async () => saved('T1')),
    T2: vi.fn(async () => saved('T2')),
    T3: vi.fn(async () => saved('T3')),
  };
});
afterEach(cleanup);

describe('LiquidarLoteModal · confirmar y errores inesperados', () => {
  it('pide confirmar con la cantidad y el total, y si se cancela no emite nada', async () => {
    confirm.mockResolvedValue(false);
    open();
    await emitirTodos();

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    const options = confirm.mock.calls[0][0] as { message: string };
    expect(options.message).toMatch(/3 liquidaciones/);
    expect(options.message).toMatch(/3[.,]?000/); // total: 3 x 1000
    for (const handle of Object.values(behavior.emitir)) expect(handle).not.toHaveBeenCalled();
    expect(onEmitted).not.toHaveBeenCalled();
  });

  it('al confirmar emite todos', async () => {
    confirm.mockResolvedValue(true);
    open();
    await emitirTodos();
    await waitFor(() => expect(onEmitted).toHaveBeenCalledTimes(1));
    expect((onEmitted.mock.calls[0][0] as SettlementRecord[]).map((s) => s.tripId)).toEqual(['T1', 'T2', 'T3']);
  });

  it('una excepción en un viaje no corta al resto y lo emitido se avisa igual', async () => {
    confirm.mockResolvedValue(true);
    behavior.emitir.T2 = vi.fn(async () => { throw new Error('se cayó la red'); });
    open();
    await emitirTodos();

    await waitFor(() => expect(onEmitted).toHaveBeenCalledTimes(1));
    const [emitidas, todas] = onEmitted.mock.calls[0] as [SettlementRecord[], boolean];
    expect(emitidas.map((s) => s.tripId)).toEqual(['T1', 'T3']);
    expect(todas).toBe(false);
    expect(behavior.emitir.T3).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
