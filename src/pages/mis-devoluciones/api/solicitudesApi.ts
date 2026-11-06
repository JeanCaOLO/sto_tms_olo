// Cliente de la API de solicitudes de devolución del cliente (backend/admin, /api/v1/solicitudes-devolucion/*).
import { apiFetch } from '../../../lib/api-client';
import type { RequestItemPayload, UploadedFile } from '../../../lib/devoluciones/solicitudes';

const BASE = '/v1/solicitudes-devolucion';

type FetchInit = NonNullable<Parameters<typeof apiFetch>[1]>;

async function call<T>(path: string, init: FetchInit = {}): Promise<T> {
  const { ok, status, body } = await apiFetch(path, init);
  if (!ok) throw new Error(body?.error?.message ?? body?.message ?? `Error ${status}`);
  return body?.data as T;
}

interface UploadForm {
  url: string;
  fields: Record<string, string>;
  key: string;
}

export interface CreatedRequest {
  id: string;
  request_number: string;
  status: string;
}

/** Sube UN archivo directo a S3 con un formulario firmado y devuelve su llave. */
export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = await call<UploadForm>(`${BASE}/archivos/url`, {
    method: 'POST', body: JSON.stringify({ mime_type: file.type }),
  });
  const data = new FormData();
  Object.entries(form.fields).forEach(([name, value]) => data.append(name, value));
  data.append('file', file); // el archivo va al final: S3 ignora lo que viene después
  const res = await fetch(form.url, { method: 'POST', body: data });
  if (!res.ok) throw new Error(`No se pudo subir «${file.name}».`);
  return { key: form.key };
}

export const createRequest = (items: RequestItemPayload[]) =>
  call<CreatedRequest>(BASE, { method: 'POST', body: JSON.stringify({ items }) });
