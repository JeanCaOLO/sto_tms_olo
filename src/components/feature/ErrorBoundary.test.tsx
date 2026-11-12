// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary, { isChunkLoadError } from './ErrorBoundary';

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renderiza los hijos cuando no hay error', () => {
    render(<ErrorBoundary><p>todo bien</p></ErrorBoundary>);
    expect(screen.getByText('todo bien')).toBeTruthy();
  });

  it('muestra la pantalla de recuperación si un hijo lanza', () => {
    render(<ErrorBoundary><Boom message="falló el render" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Algo salió mal')).toBeTruthy();
  });

  it('distingue un chunk lazy caído (versión nueva)', () => {
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/x.js" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hay una versión nueva de la aplicación')).toBeTruthy();
  });

  it('el botón Recargar llama a location.reload', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<ErrorBoundary><Boom message="x" /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('isChunkLoadError', () => {
  it('reconoce los mensajes de Chrome, Safari y webpack, y descarta otros', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: a'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('string')).toBe(false);
  });
});
