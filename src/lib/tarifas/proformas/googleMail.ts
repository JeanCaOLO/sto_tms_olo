// Cliente de la Lambda de envío (backend/tarifas-mail): conexión con Google y envío directo por Gmail.

import { apiFetch } from '../../supabase';

export interface GoogleStatus {
  connected: boolean;
  email: string | null;
}

export interface SendInput {
  proformaId: string;
  to: string[];
  subject: string;
  body: string;
  pdfBase64: string;
  fileName: string;
}

const BASE = '/tarifas-mail';

async function call<T>(path: string, init: NonNullable<Parameters<typeof apiFetch>[1]> = {}): Promise<T> {
  const { ok, status, body } = await apiFetch(`${BASE}${path}`, init);
  if (!ok) throw new Error(body?.error?.message ?? `No se pudo completar la operación (${status}).`);
  return body.data as T;
}

export const getGoogleStatus = () => call<GoogleStatus>('/google/status');

/** URL de Google para conectar la cuenta. El navegador navega a ella y Google vuelve al TMS. */
export const startGoogleConnect = async () => (await call<{ url: string }>('/google/start', { method: 'POST' })).url;

export const disconnectGoogle = () => call<GoogleStatus>('/google', { method: 'DELETE' });

export const sendProformaDirect = ({ proformaId, ...payload }: SendInput) =>
  call<{ sent: boolean; messageId: string; from: string }>(
    `/proformas/${encodeURIComponent(proformaId)}/send`,
    { method: 'POST', body: JSON.stringify(payload) },
  );

/** Un Blob como base64 (sin el prefijo `data:`), para mandarlo en el JSON del envío. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('No se pudo leer el PDF.'));
    reader.readAsDataURL(blob);
  });
}
