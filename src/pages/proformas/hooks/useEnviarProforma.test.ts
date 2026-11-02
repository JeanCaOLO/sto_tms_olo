// @vitest-environment jsdom
//
// Enviar una proforma por correo: si el correo ya salió y solo falló el registro, no se puede volver a
// enviar al transportista; y si falla el PDF no se abre Gmail como si todo hubiera ido bien.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markEmailSent, sendProformaDirect } from '../../../lib/tarifas/proformas';
import type { ProformaDetail } from '../../../lib/tarifas/proformas';
import { renderProformaPdf } from '../lib/proformaPdf';
import { useEnviarProforma } from './useEnviarProforma';

vi.mock('../../../lib/tarifas/proformas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tarifas/proformas')>()),
  getEmailConfig: vi.fn(async () => ({
    recipients: ['conta@olo.com'], includeCarrierEmail: false,
    subjectTemplate: 'Proforma {number}', bodyTemplate: 'Adjunto {number}',
  })),
  getCarrierEmail: vi.fn(async () => null),
  markEmailSent: vi.fn(),
  sendProformaDirect: vi.fn(),
  blobToBase64: vi.fn(async () => 'BASE64'),
}));
vi.mock('../lib/proformaPdf', () => ({
  renderProformaPdf: vi.fn(async () => new Blob(['pdf'])),
  downloadBlob: vi.fn(),
}));

const send = vi.mocked(sendProformaDirect);
const mark = vi.mocked(markEmailSent);
const render = vi.mocked(renderProformaPdf);

const detail = {
  proforma: {
    id: 'PF1', number: 'PF-001', countryId: 'CR', carrierId: 'C1', carrierName: 'Transportes SA',
    totalAmount: 1000, currency: 'CRC',
  },
} as unknown as ProformaDetail;

const onSent = vi.fn();

async function ready() {
  const hook = renderHook(() => useEnviarProforma(detail, onSent));
  await waitFor(() => expect(hook.result.current.recipients.length).toBeGreaterThan(0));
  return hook;
}

beforeEach(() => {
  send.mockReset();
  mark.mockReset();
  render.mockClear();
  onSent.mockReset();
  send.mockResolvedValue({ sent: true } as Awaited<ReturnType<typeof sendProformaDirect>>);
  mark.mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useEnviarProforma · envío directo', () => {
  it('envía, registra y avisa', async () => {
    const { result } = await ready();
    await act(async () => { await result.current.sendDirect(); });
    expect(send).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('si el correo sale y falla el registro, no se puede enviar de nuevo: solo reintentar el registro', async () => {
    mark.mockResolvedValueOnce({ error: 'sin conexión' });
    const { result } = await ready();

    await act(async () => { await result.current.sendDirect(); });
    expect(result.current.sent).toBe(true);
    expect(result.current.error).toContain('El correo se envió');
    expect(onSent).not.toHaveBeenCalled();

    // Un segundo "Enviar" no vuelve a mandar el correo al transportista.
    await act(async () => { await result.current.sendDirect(); });
    expect(send).toHaveBeenCalledTimes(1);

    // Reintentar el registro sí vuelve a llamarlo y, al lograrlo, termina el flujo.
    await act(async () => { await result.current.confirmSent(); });
    expect(mark).toHaveBeenCalledTimes(2);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('si el envío falla, nada salió y se puede volver a intentar', async () => {
    send.mockRejectedValueOnce(new Error('Gmail rechazó el envío'));
    const { result } = await ready();

    await act(async () => { await result.current.sendDirect(); });
    expect(result.current.sent).toBe(false);
    expect(result.current.error).toBe('Gmail rechazó el envío');
    expect(mark).not.toHaveBeenCalled();

    await act(async () => { await result.current.sendDirect(); });
    expect(send).toHaveBeenCalledTimes(2);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('dos clics seguidos en Enviar mandan un solo correo', async () => {
    const { result } = await ready();
    await act(async () => {
      const a = result.current.sendDirect();
      const b = result.current.sendDirect();
      await Promise.all([a, b]);
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('useEnviarProforma · Abrir en Gmail', () => {
  it('si falla el PDF no abre Gmail ni dice que se descargó', async () => {
    render.mockRejectedValueOnce(new Error('no se pudo generar'));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = await ready();

    await act(async () => { await result.current.openInGmail(); });
    expect(open).not.toHaveBeenCalled();
    expect(result.current.step).toBe('edit');
    expect(result.current.error).toBe('no se pudo generar');
  });

  it('con el PDF generado abre Gmail y pasa al paso de confirmar', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = await ready();

    await act(async () => { await result.current.openInGmail(); });
    expect(open).toHaveBeenCalledTimes(1);
    expect(result.current.step).toBe('opened');
  });
});
