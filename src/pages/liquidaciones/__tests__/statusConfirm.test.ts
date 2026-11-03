// @vitest-environment jsdom
//
// Pasar una liquidación a Pagado (desde ahí solo se puede anular) y anularla piden confirmación; el resto de cambios no.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmAction } from '../../../lib/confirm';
import type { SettlementRecord } from '../../../lib/tarifas/types';
import { confirmStatusChange } from '../hooks/statusConfirm';

vi.mock('../../../lib/confirm', () => ({ confirmAction: vi.fn() }));
const confirm = vi.mocked(confirmAction);

const settlement = { number: 'LIQ-CR-0007' } as SettlementRecord;

beforeEach(() => confirm.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('confirmStatusChange', () => {
  it('Pagado pide confirmar y avisa que ya no se revierte', async () => {
    confirm.mockResolvedValue(true);
    await expect(confirmStatusChange(settlement, 'Pagado')).resolves.toBe(true);
    const options = confirm.mock.calls[0][0] as { title: string; message: string; confirmLabel: string };
    expect(options.title).toBe('Marcar como pagada');
    expect(options.message).toContain('LIQ-CR-0007');
    expect(options.message).toMatch(/solo se puede anular/);
    expect(options.confirmLabel).toBe('Marcar como pagada');
  });

  it('si el usuario cancela, no se cambia el estado', async () => {
    confirm.mockResolvedValue(false);
    await expect(confirmStatusChange(settlement, 'Pagado')).resolves.toBe(false);
  });

  it('Anulado sigue pidiendo confirmar', async () => {
    confirm.mockResolvedValue(true);
    await expect(confirmStatusChange(settlement, 'Anulado')).resolves.toBe(true);
    expect((confirm.mock.calls[0][0] as { title: string }).title).toBe('Anular liquidación');
  });

  it('los demás estados cambian sin preguntar', async () => {
    await expect(confirmStatusChange(settlement, 'Aprobado')).resolves.toBe(true);
    await expect(confirmStatusChange(settlement, 'Borrador')).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
