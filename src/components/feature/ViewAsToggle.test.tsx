// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PermissionsProvider, usePermissions } from '../../hooks/usePermissions';
import ViewAsToggle from './ViewAsToggle';

const mine = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ session: { token: 'x' } }) }));
vi.mock('../../lib/mock-auth', () => ({ MOCK_AUTH_ENABLED: false }));
vi.mock('../../pages/configuracion/admin/admin-api', () => ({ getMyPermissions: async () => mine.value }));

function Probe() {
  const { can } = usePermissions();
  return (
    <p data-testid="probe">
      {[can('tarifas.config', 'edit'), can('tarifas.config', 'view'), can('tarifas', 'edit'), can('pedidos', 'view')].join(',')}
    </p>
  );
}

function view() {
  return render(
    <MemoryRouter>
      <PermissionsProvider><ViewAsToggle /><Probe /></PermissionsProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => { sessionStorage.clear(); });
afterEach(cleanup);

describe('Ver como (Liquidador / Desarrollador)', () => {
  it('un administrador ve los dos botones y alterna entre las dos vistas', async () => {
    mine.value = { role: 'SuperUsuario', is_admin: true, modules: {}, countries: { all: true, ids: [] } };
    view();
    await screen.findByText('Desarrollador');
    expect(screen.getByTestId('probe').textContent).toBe('true,true,true,true');

    fireEvent.click(screen.getByText('Liquidador'));
    // Liquidador: lee la configuración (no la edita), liquida y no ve lo demás del sistema.
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('false,true,true,false'));
    expect(screen.getByText('Liquidador').closest('button')!.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByText('Desarrollador'));
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('true,true,true,true'));
  });

  it('quien no puede configurar el tarifador no ve los botones', async () => {
    mine.value = {
      role: 'Liquidador', is_admin: false,
      modules: { tarifas: ['view', 'edit'], 'tarifas.config': ['view'] }, countries: { all: true, ids: [] },
    };
    view();
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('false,true,true,false'));
    expect(screen.queryByText('Desarrollador')).toBeNull();
  });
});
