// @vitest-environment jsdom
//
// En móvil el menú lateral es un cajón sobre la pantalla: al elegir un módulo debe cerrarse solo (antes quedaba tapando
// la pantalla hasta pulsar el fondo o la X).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider, useSidebar } from '../../hooks/useSidebar';
import Sidebar from './Sidebar';

vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));

function Harness() {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => setMobileOpen(true)}>abrir menú</button>
      <button onClick={() => navigate('/tracking')}>ir a tracking</button>
      <span data-testid="abierto">{String(mobileOpen)}</span>
      <Sidebar />
    </>
  );
}

const open = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <SidebarProvider><Harness /></SidebarProvider>
  </MemoryRouter>,
);
const abierto = () => screen.getByTestId('abierto').textContent;

afterEach(cleanup);

describe('Sidebar en móvil', () => {
  it('se cierra al navegar a otro módulo', () => {
    open();
    fireEvent.click(screen.getByText('abrir menú'));
    expect(abierto()).toBe('true');

    fireEvent.click(screen.getByText('ir a tracking'));
    expect(abierto()).toBe('false');
  });

  it('abrirlo de nuevo sin cambiar de ruta lo deja abierto', () => {
    open();
    fireEvent.click(screen.getByText('abrir menú'));
    fireEvent.click(screen.getByText('ir a tracking'));
    fireEvent.click(screen.getByText('abrir menú'));
    expect(abierto()).toBe('true');
  });

  it('un clic en el fondo oscuro sigue cerrándolo', () => {
    const { container } = open();
    fireEvent.click(screen.getByText('abrir menú'));
    fireEvent.click(container.querySelector('.bg-black\\/50') as HTMLElement);
    expect(abierto()).toBe('false');
  });
});

describe('botones de ícono del menú lateral', () => {
  it('el de contraer cambia de nombre y de aria-expanded según el estado', () => {
    open();
    const boton = screen.getByRole('button', { name: 'Contraer menú' });
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(boton);
    const expandir = screen.getByRole('button', { name: 'Expandir menú' });
    expect(expandir.getAttribute('aria-expanded')).toBe('false');
  });

  it('el de cerrar el cajón móvil tiene nombre', () => {
    open();
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toBeTruthy();
  });
});
