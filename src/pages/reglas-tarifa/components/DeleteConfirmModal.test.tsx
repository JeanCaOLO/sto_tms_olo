// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeleteConfirmModal from './DeleteConfirmModal';

afterEach(cleanup);

describe('DeleteConfirmModal', () => {
  const props = { isOpen: true, title: 'Eliminar regla', description: '¿Seguro?', onConfirm: vi.fn() };

  it('es un diálogo con nombre, Escape lo cierra y el foco entra al diálogo', () => {
    const onClose = vi.fn();
    render(<DeleteConfirmModal {...props} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Eliminar regla' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mientras elimina, Escape no lo cierra', () => {
    const onClose = vi.fn();
    render(<DeleteConfirmModal {...props} onClose={onClose} busy />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cerrado no pinta nada', () => {
    render(<DeleteConfirmModal {...props} isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
