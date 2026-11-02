// @vitest-environment jsdom
//
// La bitácora no muestra eventos de un rango anterior si la respuesta llega después de cambiar el rango.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listProformaEvents, type DateRange, type ProformaEvent } from '../../../lib/tarifas/proformas';
import ProformaBitacora from './ProformaBitacora';

vi.mock('../../../lib/tarifas/proformas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tarifas/proformas')>()),
  listProformaEvents: vi.fn(),
}));
const listEvents = vi.mocked(listProformaEvents);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const event = (id: number, user: string) => ({
  id, entity_id: 'X', user_name: user, role: 'Liquidador', action: 'approve', reason: null, before: null, after: null,
  created_at: '2026-10-16T15:00:00Z',
}) as unknown as ProformaEvent;
const range = (day: string): DateRange => ({ preset: 'custom', from: day, to: day });

beforeEach(() => listEvents.mockReset());
afterEach(cleanup);

describe('ProformaBitacora · respuestas viejas', () => {
  it('el rango anterior que responde tarde no reemplaza al vigente', async () => {
    const old = deferred<ProformaEvent[]>();
    const fresh = deferred<ProformaEvent[]>();
    listEvents.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);

    const view = (r: DateRange) => <MemoryRouter><ProformaBitacora range={r} /></MemoryRouter>;
    const { rerender } = render(view(range('2026-10-15')));
    rerender(view(range('2026-10-16')));

    await act(async () => { fresh.resolve([event(2, 'Ana Nueva')]); });
    await waitFor(() => expect(screen.getByText('Ana Nueva')).toBeTruthy());

    await act(async () => { old.resolve([event(1, 'Beto Viejo')]); });
    expect(screen.queryByText('Beto Viejo')).toBeNull();
    expect(screen.getByText('Ana Nueva')).toBeTruthy();
  });
});
