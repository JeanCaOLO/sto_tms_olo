// Subida/descarga del PDF del contrato del transportista.
//
// El PDF va DIRECTO del navegador a S3 con un formulario firmado (presigned
// POST): no pasa por nuestra API. Contrato del backend (canal 2026-10-12):
//   1. POST /v1/carriers/{id}/contract/upload  -> { url, fields, key, max_bytes }
//   2. fetch(url, {method:'POST', body: FormData}) SIN Authorization -> 204
//   3. PUT  /v1/carriers/{id}/contract  body { key } -> { contract_file_key }
import { apiFetch } from '../../lib/supabase';

export const CONTRACT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ContractUploadResult {
  ok: boolean;
  error?: string;
}

/** Valida el archivo elegido antes de pedir el formulario firmado (mejor mensaje que un 403 de S3). */
export function validateContractFile(file: File): string | null {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return 'El contrato debe ser un archivo PDF.';
  }
  if (file.size > CONTRACT_MAX_BYTES) return 'El PDF no puede superar los 10 MB.';
  return null;
}

/** Sube el PDF del contrato de un transportista ya existente (necesita su id). */
export async function uploadCarrierContract(carrierId: string, file: File): Promise<ContractUploadResult> {
  const invalid = validateContractFile(file);
  if (invalid) return { ok: false, error: invalid };

  // 1. Pedir el formulario firmado.
  const pre = await apiFetch(`/v1/carriers/${carrierId}/contract/upload`, { method: 'POST' });
  if (!pre.ok || !pre.body?.data?.url) {
    return { ok: false, error: pre.body?.error?.message ?? 'No se pudo preparar la subida del contrato.' };
  }
  const { url, fields, key } = pre.body.data as { url: string; fields: Record<string, string>; key: string };

  // 2. Subir directo a S3. Los `fields` van PRIMERO (en orden) y `file` al final.
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', file);
  let s3: Response;
  try {
    s3 = await fetch(url, { method: 'POST', body: form }); // SIN Authorization: es S3, no nuestra API.
  } catch {
    return { ok: false, error: 'No se pudo subir el PDF a almacenamiento.' };
  }
  if (!s3.ok) {
    return { ok: false, error: s3.status === 403 ? 'El archivo fue rechazado (tipo o tamaño).' : 'Falló la subida del PDF.' };
  }

  // 3. Confirmar: el backend verifica que el PDF llegó y guarda la llave.
  const confirm = await apiFetch(`/v1/carriers/${carrierId}/contract`, {
    method: 'PUT',
    body: JSON.stringify({ key }),
  });
  if (!confirm.ok) {
    return { ok: false, error: confirm.body?.error?.message ?? 'No se pudo confirmar el contrato.' };
  }
  return { ok: true };
}

/** Abre el PDF del contrato en una pestaña nueva (URL firmada, vale ~5 min). */
export async function openCarrierContract(carrierId: string): Promise<string | null> {
  const res = await apiFetch(`/v1/carriers/${carrierId}/contract`);
  if (res.ok && res.body?.data?.url) {
    window.open(res.body.data.url as string, '_blank', 'noopener');
    return null;
  }
  if (res.status === 404) return 'Este transportista no tiene contrato cargado.';
  return res.body?.error?.message ?? 'No se pudo abrir el contrato.';
}

/** Quita el contrato (el archivo queda en el historial del bucket). */
export async function removeCarrierContract(carrierId: string): Promise<ContractUploadResult> {
  const res = await apiFetch(`/v1/carriers/${carrierId}/contract`, { method: 'DELETE' });
  if (!res.ok) return { ok: false, error: res.body?.error?.message ?? 'No se pudo quitar el contrato.' };
  return { ok: true };
}
