// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReasonModal from './ReasonModal';

afterEach(cleanup);

const base = { title: 'Apelar', label: 'Motivo', confirmLabel: 'Apelar', onConfirm: vi.fn(), onClose: vi.fn() };

describe('ReasonModal', () => {
  it('muestra el error dentro del propio modal (no detrás de él)', () => {
    render(<ReasonModal {...base} error="Tu rol no puede apelar este reclamo." />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Tu rol no puede apelar este reclamo.');
    expect(screen.getByRole('dialog').contains(alert)).toBe(true);
  });

  it('sin error no muestra ningún aviso', () => {
    render(<ReasonModal {...base} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('exige el motivo cuando es obligatorio y lo manda sin espacios sobrantes', () => {
    const onConfirm = vi.fn();
    render(<ReasonModal {...base} onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: 'Apelar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  no procede  ' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('no procede');
  });
});
