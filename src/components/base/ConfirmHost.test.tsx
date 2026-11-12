// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ConfirmHost from './ConfirmHost';
import { confirmAction } from '../../lib/confirm';

describe('ConfirmHost', () => {
  afterEach(cleanup);

  it('resuelve true al aceptar y muestra el mensaje en un modal propio', async () => {
    const native = vi.spyOn(window, 'confirm');
    render(<ConfirmHost />);
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => { answer = confirmAction({ title: 'Anular', message: '¿Anular LIQ-1?', confirmLabel: 'Anular' }); });

    expect(await screen.findByText('¿Anular LIQ-1?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Anular' }));
    expect(await answer).toBe(true);
    expect(native).not.toHaveBeenCalled();
    native.mockRestore();
  });

  it('resuelve false al cancelar y al cerrar con Escape', async () => {
    render(<ConfirmHost />);
    let first: Promise<boolean> = Promise.resolve(true);
    act(() => { first = confirmAction('¿Seguir?'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(await first).toBe(false);

    let second: Promise<boolean> = Promise.resolve(true);
    act(() => { second = confirmAction('¿Otra vez?'); });
    await screen.findByText('¿Otra vez?');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await second).toBe(false);
  });

  it('sin host usa window.confirm', async () => {
    const native = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await confirmAction('¿Ok?')).toBe(true);
    expect(native).toHaveBeenCalledWith('¿Ok?');
    native.mockRestore();
  });
});
