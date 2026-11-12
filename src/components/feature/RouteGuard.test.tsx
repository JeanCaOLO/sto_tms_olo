// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const permissions = vi.hoisted(() => ({
  state: { loading: false, can: (() => true) as (m: string, a: string) => boolean },
}));

vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => permissions.state }));
vi.mock('../../pages/auditoria/audit-api', () => ({ postAuditEvent: vi.fn() }));
vi.mock('../../pages/NoAccess', () => ({ default: () => <p>sin acceso</p> }));

import RouteGuard from './RouteGuard';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteGuard><p>contenido protegido</p></RouteGuard>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  permissions.state = { loading: false, can: () => true };
});

afterEach(cleanup);

describe('RouteGuard', () => {
  it('no monta la página protegida mientras cargan los permisos', () => {
    permissions.state = { loading: true, can: () => true };
    renderAt('/tracking');
    expect(screen.queryByText('contenido protegido')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('muestra la página cuando hay permiso view', () => {
    renderAt('/tracking');
    expect(screen.getByText('contenido protegido')).toBeTruthy();
  });

  it('muestra NoAccess cuando falta el permiso view', () => {
    permissions.state = { loading: false, can: () => false };
    renderAt('/tracking');
    expect(screen.getByText('sin acceso')).toBeTruthy();
    expect(screen.queryByText('contenido protegido')).toBeNull();
  });

  it('deja pasar las rutas sin permKey aunque carguen los permisos', () => {
    permissions.state = { loading: true, can: () => false };
    renderAt('/ruta-sin-modulo');
    expect(screen.getByText('contenido protegido')).toBeTruthy();
  });
});
