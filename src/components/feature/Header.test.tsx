// @vitest-environment jsdom
//
// Encabezado: sin elementos que no hacen nada (buscador, "Mi Perfil"); "Configuración" lleva a su pantalla si el rol la
// tiene; "Cerrar sesión" cierra la sesión y va al login.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '../../hooks/useSidebar';
import Header from './Header';

const state = vi.hoisted(() => ({ canConfig: true, signOut: vi.fn(async () => undefined) }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    appUser: { full_name: 'Ana Mora', email: 'ana@example.com', role: { name: 'Admin' } },
    signOut: state.signOut,
  }),
}));
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (module: string) => (module === 'configuracion' ? state.canConfig : true) }),
}));
vi.mock('./ContextSelector', () => ({ default: () => null }));
vi.mock('./NotificationsMenu', () => ({ default: () => null }));
vi.mock('./LanguageSwitcher', () => ({ default: () => null }));

function Ubicacion() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

const open = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <SidebarProvider>
      <Header />
      <Routes><Route path="*" element={<Ubicacion />} /></Routes>
    </SidebarProvider>
  </MemoryRouter>,
);
const abrirPerfil = () => fireEvent.click(screen.getByText('Ana Mora').closest('button') as HTMLElement);

beforeEach(() => { state.canConfig = true; state.signOut.mockClear(); });
afterEach(cleanup);

describe('Header', () => {
  it('no muestra el buscador que no hacía nada', () => {
    open();
    expect(screen.queryByPlaceholderText(/Buscar pedidos/)).toBeNull();
  });

  it('el menú del perfil no ofrece "Mi Perfil" (no existe esa pantalla)', () => {
    open();
    abrirPerfil();
    expect(screen.queryByText('Mi Perfil')).toBeNull();
  });

  it('"Configuración" lleva a /configuracion y cierra el menú', () => {
    open();
    abrirPerfil();
    fireEvent.click(screen.getByRole('button', { name: /Configuración/ }));
    expect(screen.getByTestId('ruta').textContent).toBe('/configuracion');
    expect(screen.queryByRole('button', { name: /Cerrar Sesión/ })).toBeNull();
  });

  it('sin permiso sobre Configuración no aparece la opción', () => {
    state.canConfig = false;
    open();
    abrirPerfil();
    expect(screen.queryByRole('button', { name: /Configuración/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Cerrar Sesión/ })).toBeTruthy();
  });

  it('"Cerrar Sesión" cierra la sesión y va a /login', async () => {
    open();
    abrirPerfil();
    fireEvent.click(screen.getByRole('button', { name: /Cerrar Sesión/ }));
    await vi.waitFor(() => expect(screen.getByTestId('ruta').textContent).toBe('/login'));
    expect(state.signOut).toHaveBeenCalledTimes(1);
  });
});
