// @vitest-environment jsdom
//
// Mientras el correo se está enviando el modal no se puede cerrar (ni con Esc ni con Cancelar): cerrarlo dejaba el envío
// en curso sin que el usuario viera cómo terminaba.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProformaDetail } from '../../../lib/tarifas/proformas';
import EnviarProformaModal from './EnviarProformaModal';

const model = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../hooks/useEnviarProforma', () => ({ useEnviarProforma: () => model.value }));
vi.mock('../config/GoogleConnection', () => ({ default: () => null }));

const detail = { proforma: { id: 'P1', number: 'PF-001', carrierName: 'Transportes SA' } } as unknown as ProformaDetail;

const base = () => ({
  config: { includeCarrierEmail: false }, carrierEmail: null, to: 'a@b.com', setTo: vi.fn(), subject: 'Asunto',
  setSubject: vi.fn(), body: 'Cuerpo', setBody: vi.fn(), recipients: ['a@b.com'], busy: false, error: null,
  step: 'edit', sent: false, fileName: 'p.pdf', openInGmail: vi.fn(), sendDirect: vi.fn(), confirmSent: vi.fn(),
});

const onClose = vi.fn();
const open = () => render(<EnviarProformaModal detail={detail} onClose={onClose} onSent={vi.fn()} />);
const escape = () => fireEvent.keyDown(document, { key: 'Escape' });

beforeEach(() => { onClose.mockReset(); model.value = base(); });
afterEach(cleanup);

describe('EnviarProformaModal · cierre', () => {
  it('con un envío en curso ni Esc ni Cancelar lo cierran', () => {
    model.value = { ...base(), busy: true };
    open();
    escape();
    expect(onClose).not.toHaveBeenCalled();
    const cancelar = screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement;
    expect(cancelar.disabled).toBe(true);
    fireEvent.click(cancelar);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sin envío en curso se cierra con Esc y con Cancelar', () => {
    open();
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
