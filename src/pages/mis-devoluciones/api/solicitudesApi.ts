// Cliente de la API de solicitudes de devolución del cliente (backend/admin, /api/v1/solicitudes-devolucion/*).
import { apiFetch } from '../../../lib/api-client';
import type { RequestItemPayload, UploadedFile } from '../../../lib/devoluciones/solicitudes';

const BASE = '/v1/solicitudes-devolucion';

type FetchInit = NonNullable<Parameters<typeof apiFetch>[1]>;

export class RequestApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {super(message);this.status=status;this.name = 'RequestApiError';}
}

async function call<T>(path: string, init: FetchInit = {}): Promise<T> {
  const { ok, status, body } = await apiFetch(path, init);
  if (!ok) throw new RequestApiError(status, body?.error?.message ?? body?.message ?? `Error ${status}`);
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

export const createRequest = (items: RequestItemPayload[], idempotencyKey: string) =>
  call<CreatedRequest>(BASE, { method: 'POST', body: JSON.stringify({ items, idempotency_key: idempotencyKey }) });

export interface MyReturnRequest {
  id: string;
  request_number: string;
  status: string;
  created_at: string;
  items: number;
  decided_by?: string | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
  rejection_reason?: string | null;
}

export const listMyRequests = () => call<MyReturnRequest[]>(`${BASE}/mias`);

export interface ClientAssignment {id: string; name: string}
export interface RequestFile {id: string; kind: 'photo' | 'video'; mime_type: string; size_bytes: number}
export interface RequestDetail {
  request: Omit<MyReturnRequest, 'items'> & {customer_id: string; customer_name: string; requested_by: string};
  items: {id: string; line_number: number; product_code: string; product_name: string | null; quantity: number;
    reason_code: string; description: string | null; files: RequestFile[]}[];
}
export interface SignedRequestFile {url: string; kind: 'photo' | 'video'; mime_type: string; expires_in: number}
export const getClientAssignment = () => call<ClientAssignment>(`${BASE}/asignacion`, {cache: 'no-store'});
export const getRequest = (id: string) => call<RequestDetail>(`${BASE}/${encodeURIComponent(id)}`, {cache: 'no-store'});
export const getFileUrl = (requestId: string, fileId: string) => call<SignedRequestFile>(
  `${BASE}/${encodeURIComponent(requestId)}/archivos/${encodeURIComponent(fileId)}/url`, {cache: 'no-store'});

export interface InboxRequest extends MyReturnRequest {
  customer_id: string;
  customer_name: string;
  requested_by: string;
  requested_by_name: string | null;
}
export interface RequestInboxPage {
  items: InboxRequest[];
  companies: ClientAssignment[];
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface RequestInboxQuery {estado?: string; empresa?: string; pais?: string | null; limit: number; offset: number}
export function listRequestInbox(query: RequestInboxQuery) {
  const params = new URLSearchParams({limit: String(query.limit), offset: String(query.offset)});
  if (query.estado) params.set('estado', query.estado);
  if (query.empresa) params.set('empresa', query.empresa);
  if (query.pais) params.set('pais', query.pais);
  return call<RequestInboxPage>(`${BASE}?${params}`, {cache: 'no-store'});
}
export const approveRequest = (id: string) => call<CreatedRequest>(`${BASE}/${encodeURIComponent(id)}/aprobar`, {method: 'POST'});
export const rejectRequest = (id: string, reason: string) => call<CreatedRequest>(`${BASE}/${encodeURIComponent(id)}/rechazar`,
  {method: 'POST', body: JSON.stringify({reason})});
