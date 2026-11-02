// @vitest-environment jsdom
// Un botón que solo trae un ícono necesita nombre accesible: sin él el lector de pantalla dice "botón" y nada más.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataTable from './base/DataTable';
import ToastStack from './base/ToastStack';
import NotificationsMenu from './feature/NotificationsMenu';

const state = vi.hoisted(() => ({ unread: 0 }));
vi.mock('../hooks/use-notifications', () => ({
  useNotifications: () => ({ items: [], unreadCount: state.unread, markAllRead: vi.fn(), markRead: vi.fn() }),
}));

afterEach(cleanup);

describe('campana de notificaciones', () => {
  const ref = { current: null } as React.RefObject<HTMLButtonElement>;

  it('se llama "Notificaciones" y con avisos nuevos dice cuántos', () => {
    state.unread = 0;
    const { rerender } = render(<NotificationsMenu open={false} onToggle={vi.fn()} buttonRef={ref} />);
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeTruthy();
    state.unread = 3;
    rerender(<NotificationsMenu open={false} onToggle={vi.fn()} buttonRef={ref} />);
    expect(screen.getByRole('button', { name: 'Notificaciones (3 sin leer)' })).toBeTruthy();
  });
});

describe('cerrar un aviso', () => {
  it('el botón de la x se llama "Cerrar aviso" y descarta ese aviso', () => {
    const onDismiss = vi.fn();
    render(<ToastStack toasts={[{ id: 7, message: 'Guardado', variant: 'success' }]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});

type Fila = { id: string; customer: string };

describe('filtro de columna de la tabla', () => {
  it('el ícono de filtro dice de qué columna es', () => {
    render(
      <MemoryRouter>
        <DataTable
          data={[{ id: '1', customer: 'EPA' } as Fila]}
          columns={[{ key: 'customer', header: 'Cliente', accessor: (r: Fila) => r.customer, filterable: true }]}
          getRowId={(r: Fila) => r.id}
          pageSize={25}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Filtrar Cliente' })).toBeTruthy();
  });
});
