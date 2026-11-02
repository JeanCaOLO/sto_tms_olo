// @vitest-environment jsdom
//
// La página 404 estaba en inglés con texto de plantilla ("This page has not been generated") y sin salida.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import NotFound from './NotFound';

const open = (path = '/ruta-que-no-existe') => render(
  <MemoryRouter initialEntries={[path]}><NotFound /></MemoryRouter>,
);

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('es');
});

describe('NotFound', () => {
  it('habla en español, muestra la ruta pedida y ofrece volver al inicio', () => {
    open('/ruta-que-no-existe');
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeTruthy();
    expect(screen.getByText('/ruta-que-no-existe')).toBeTruthy();
    expect((screen.getByRole('link', { name: 'Volver al inicio' }) as HTMLAnchorElement).getAttribute('href')).toBe('/dashboard');
  });

  it('ya no muestra el texto de plantilla en inglés', () => {
    open();
    expect(screen.queryByText(/has not been generated/i)).toBeNull();
    expect(screen.queryByText(/Tell me more/i)).toBeNull();
  });

  it('en inglés también está traducida', async () => {
    await i18n.changeLanguage('en');
    open();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeTruthy();
  });
});
