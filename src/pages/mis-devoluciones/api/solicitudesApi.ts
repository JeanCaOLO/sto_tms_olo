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
  approval_mode?: 'legacy' | 'automatic';
}

/** Sube UN archivo directo a S3 con un formulario firmado y devuelve su llave. */
export async function uploadFile(file: File, customerId?: string): Promise<UploadedFile> {
  const form = await call<UploadForm>(`${BASE}/archivos/url`, {
    method: 'POST', body: JSON.stringify({ mime_type: file.type, ...(customerId ? {customer_id: customerId} : {}) }),
  });
  const data = new FormData();
  Object.entries(form.fields).forEach(([name, value]) => data.append(name, value));
  data.append('file', file); // el archivo va al final: S3 ignora lo que viene después
  const res = await fetch(form.url, { method: 'POST', body: data });
  if (!res.ok) throw new Error(`No se pudo subir «${file.name}».`);
  return { key: form.key };
}

export const createRequest = (items: RequestItemPayload[], idempotencyKey: string, customerId?: string, orderId?: string, pointId?: string) =>
  call<CreatedRequest>(BASE, { method: 'POST', body: JSON.stringify({ items, idempotency_key: idempotencyKey,
    ...(orderId ? {order_id: orderId, delivery_point_id: pointId} : {}),
    ...(customerId ? {customer_id: customerId} : {}) }) });

export interface MyReturnRequest {
  id: string;
  request_number: string;
  status: string;
  approval_mode?: 'legacy' | 'automatic';
  created_at: string;
  items: number;
  decided_by?: string | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
  rejection_reason?: string | null;
  operational_status?:string;
  operational_updated_at?:string|null;
  origin?:{order_number:string;final_customer_name:string;address:string;zone_name:string}|null;
  item_progress?:{request_item_id:string;product_code:string;presentation:string|null;requested:number;
    assigned:number;collected:number;delivered:number;received:number}[]|null;
  tracking?:{assignment_id:string;attempt_id:string;request_item_id:string;route_id:string;stop_id:string;
    assigned_quantity:number;collected_quantity:number|null;delivered:boolean;return_id:string|null}[]|null;
  planning_issue?:string|null;
}

export const listMyRequests = () => call<MyReturnRequest[]>(`${BASE}/mias`);

export interface ClientAssignment {id: string; name: string}
export interface RequestOrigin {
  order_id:string;order_number:string;delivery_point_id:string;point_name:string;address:string;
  final_customer_name:string;zone_name:string;country_id:string;warehouse_id:string;
}
export interface OrderBalance {
  id:string;line_number:number;product_code:string;product_name:string|null;presentation:string|null;
  quantity:number;remaining:number;
}
export function getRequestOrigins(customerId?:string) {
  const params=new URLSearchParams({origenes:'1'});
  if(customerId)params.set('customer_id',customerId);
  return call<RequestOrigin[]>(`${BASE}/asignacion?${params}`,{cache:'no-store'});
}
export function getOrderBalance(orderId:string,customerId?:string) {
  const params=new URLSearchParams({origenes:'1',order_id:orderId});
  if(customerId)params.set('customer_id',customerId);
  return call<OrderBalance[]>(`${BASE}/asignacion?${params}`,{cache:'no-store'});
}
export interface RequestFile {id: string; kind: 'photo' | 'video'; mime_type: string; size_bytes: number}
export interface RequestDetail {
  request: Omit<MyReturnRequest, 'items'> & {customer_id: string; customer_name: string; requested_by: string};
  items: {id: string; line_number: number; product_code: string; product_name: string | null; quantity: number;
    reason_code: string; description: string | null; files: RequestFile[]}[];
}
export interface SignedRequestFile {url: string; kind: 'photo' | 'video'; mime_type: string; expires_in: number}
export const getClientAssignment = () => call<ClientAssignment>(`${BASE}/asignacion`, {cache: 'no-store'});
export const getCreationCompanies = (countryId?: string | null) => {
  const params = new URLSearchParams({empresas: '1'});
  if (countryId) params.set('pais', countryId);
  return call<ClientAssignment[]>(`${BASE}/asignacion?${params}`, {cache: 'no-store'});
};
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
