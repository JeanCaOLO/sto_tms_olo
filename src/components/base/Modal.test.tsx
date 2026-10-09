// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

afterEach(cleanup);

describe('Modal', () => {
  it('no renderiza nada cerrado', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Prueba"><p>contenido</p></Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('expone role=dialog, aria-modal y nombre accesible', () => {
    render(<Modal isOpen onClose={() => {}} title="Editar regla"><button>Guardar</button></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Editar regla' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('cierra con Escape', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="x"><button>ok</button></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cierra al hacer clic en el fondo, salvo que se desactive', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal isOpen onClose={onClose} title="x"><button>ok</button></Modal>);
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Modal isOpen onClose={onClose} title="x" closeOnBackdrop={false}><button>ok</button></Modal>);
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('atrapa el foco con Tab y devuelve el foco al cerrar', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Modal isOpen onClose={() => {}} title="x"><button>uno</button><button>dos</button></Modal>);
    const [uno, dos] = [screen.getByText('uno'), screen.getByText('dos')];
    expect(document.activeElement).toBe(uno);
    dos.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(uno);

    rerender(<Modal isOpen={false} onClose={() => {}} title="x"><button>uno</button></Modal>);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
