// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormView, ReturnTrip, TripDetail } from '../../../lib/devoluciones/types';
import { getForm } from '../api/devolucionesApi';
import { useTripDetail } from '../hooks/useTripDetail';
import TripCard from './TripCard';

vi.mock('../api/devolucionesApi', () => ({ getForm: vi.fn(), receiveAll: vi.fn(), receiveReturn: vi.fn() }));
vi.mock('../hooks/useTripDetail', () => ({ useTripDetail: vi.fn() }));
vi.mock('./ReturnLinesTable', () => ({ default: () => null }));
vi.mock('../components/ReceiveModal', () => ({ default: () => null }));
vi.mock('../components/ReturnFormModal', () => ({
  default: ({ detail, onClose }: { detail: FormView; onClose: () => void }) => (
    <div role="dialog">Formulario actual: {detail.form?.id ?? 'nuevo'}<button onClick={onClose}>Cerrar formulario</button></div>
  ),
}));

const trip: ReturnTrip = {
  route_id: 'route-1', route_number: 'R-1', route_date: '2026-11-11', plan_trip_id: null, route_status: 'completed',
  driver_name: null, carrier_name: null, country_id: 'cr', total_returns: 2, received_returns: 2, pending_returns: 0,
  last_return_at: null, forms_count: 2,
};
const detail: TripDetail = {
  trip, returns: [], sections: [], defaults: { transport: null },
  forms: ['A', 'B'].map((id) => ({ id, form_number: id, created_at: '', updated_at: '', returns_count: 1 })),
};
const view = (id: string): FormView => ({
  ...detail,
  form: { id, form_number: id, physical_receipt_number: null, branch: null, return_kind: 'devolucion', merchandise_for: null,
    observations: null, transport: null, guide_number: null, comments: null, received_by_name: null, received_date: null,
    created_at: '', updated_at: '' },
});
const deferred = () => {
  let resolve!: (value: FormView) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<FormView>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useTripDetail).mockReturnValue({ detail, loading: false, error: null, reload: vi.fn() });
});
afterEach(cleanup);

function openCard() {
  render(<TripCard trip={trip} canEdit={false} canPrint={false} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Viaje R-1/ }));
}

describe('apertura de formularios', () => {
  it('conserva el último formulario solicitado aunque el anterior responda después', async () => {
    const first = deferred(), second = deferred();
    vi.mocked(getForm).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    openCard();
    fireEvent.click(screen.getByRole('button', { name: /A ·/ }));
    fireEvent.click(screen.getByRole('button', { name: /B ·/ }));
    await act(async () => second.resolve(view('B')));
    await act(async () => first.resolve(view('A')));
    expect(screen.getByRole('dialog').textContent).toContain('Formulario actual: B');
  });

  it('ignora el error de una apertura reemplazada', async () => {
    const first = deferred();
    vi.mocked(getForm).mockReturnValueOnce(first.promise).mockResolvedValueOnce(view('B'));
    openCard();
    fireEvent.click(screen.getByRole('button', { name: /A ·/ }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /B ·/ })));
    await act(async () => first.reject(new Error('Error antiguo')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('dialog').textContent).toContain('Formulario actual: B');
  });

  it('cerrar el formulario invalida una apertura pendiente', async () => {
    const pending = deferred();
    vi.mocked(getForm).mockResolvedValueOnce(view('A')).mockReturnValueOnce(pending.promise);
    openCard();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /A ·/ })));
    fireEvent.click(screen.getByRole('button', { name: /B ·/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar formulario' }));
    await act(async () => pending.resolve(view('B')));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('plegar el viaje invalida una apertura pendiente', async () => {
    const pending = deferred();
    vi.mocked(getForm).mockReturnValueOnce(pending.promise);
    openCard();
    fireEvent.click(screen.getByRole('button', { name: /A ·/ }));
    fireEvent.click(screen.getByRole('button', { name: /Viaje R-1/ }));
    await act(async () => pending.resolve(view('A')));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
