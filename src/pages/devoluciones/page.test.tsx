// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DevolucionesPage from './page';
import { useReturnTrips } from './hooks/useReturnTrips';

vi.mock('./hooks/useReturnTrips', () => ({ useReturnTrips: vi.fn() }));
vi.mock('../../hooks/use-module-permissions', () => ({ useModulePermissions: () => ({ canEdit: true, canExport: true }) }));
vi.mock('../../components/feature/DateRangeFilter', () => ({ default: () => null }));
vi.mock('./parts/TripCard', () => ({ default: () => null }));
const loadMore = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useReturnTrips).mockReturnValue({ summary: null, trips: [], loading: false, error: null, reload: vi.fn(),
    hasMore: true, loadingMore: false, loadMoreError: null, loadMore });
});
afterEach(cleanup);

describe('continuación del listado de Devoluciones', () => {
  it('ofrece cargar los viajes que quedan y ejecuta la lectura', () => {
    render(<DevolucionesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más viajes' }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
  it('oculta el botón cuando ya no queda otra página', () => {
    vi.mocked(useReturnTrips).mockReturnValue({ ...vi.mocked(useReturnTrips)('pendientes', '', ''), hasMore: false });
    render(<DevolucionesPage />);
    expect(screen.queryByRole('button', { name: 'Cargar más viajes' })).toBeNull();
  });
  it('muestra el error de la siguiente página y ofrece reintentar', () => {
    vi.mocked(useReturnTrips).mockReturnValue({ ...vi.mocked(useReturnTrips)('pendientes', '', ''), loadMoreError: 'Error de red' });
    render(<DevolucionesPage />);
    expect(screen.getByRole('alert').textContent).toContain('Error de red');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar cargar más' }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});
