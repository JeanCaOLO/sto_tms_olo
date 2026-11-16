// Cliente de la API de devoluciones (backend/admin, /api/v1/devoluciones/*).
import { apiFetch } from '../../../lib/api-client';
import type {
  FormDraft, FormView, ReturnCondition, ReturnSummary, ReturnTrip, TripDetail, TripFilter,
} from '../../../lib/devoluciones/types';

const BASE = '/v1/devoluciones';

export class ReturnApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {super(message);this.status=status;this.name='ReturnApiError';}
}

type FetchInit = NonNullable<Parameters<typeof apiFetch>[1]>;

function errorMessage(status: number, body: any): string {
  return body?.error?.message ?? body?.message ?? `Error ${status}`;
}

async function call<T>(path: string, init: FetchInit = {}): Promise<T> {
  const { ok, status, body } = await apiFetch(path, init);
  if (!ok) throw new ReturnApiError(status, errorMessage(status, body));
  return body?.data as T;
}

const send = (method: string, payload?: unknown): FetchInit => ({
  method,
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

export interface TripQuery {
  state: TripFilter;
  from?: string;
  to?: string;
  countryId?: string | null;
}

export function getSummary(countryId?: string | null) {
  const params = new URLSearchParams();
  if (countryId) params.set('pais', countryId);
  const q = params.toString();
  return call<ReturnSummary>(`${BASE}/resumen${q ? `?${q}` : ''}`);
}

function tripParams({ state, from, to, countryId }: TripQuery) {
  const params = new URLSearchParams({ estado: state });
  if (from) params.set('desde', from);
  if (to) params.set('hasta', to);
  if (countryId) params.set('pais', countryId);
  return params;
}

export function listTrips(query: TripQuery) {
  return call<ReturnTrip[]>(`${BASE}/viajes?${tripParams(query).toString()}`);
}

export interface TripsPage {
  trips: ReturnTrip[];
  nextCursor: string | null;
}

/** La lista carga páginas pequeñas; el contrato data:[] sigue siendo compatible con los clientes anteriores. */
export async function listTripsPage(query: TripQuery, cursor?: string): Promise<TripsPage> {
  const params = tripParams(query);
  params.set('limit', '100');
  if (cursor) params.set('cursor', cursor);
  const { ok, status, body } = await apiFetch(`${BASE}/viajes?${params.toString()}`);
  if (!ok) throw new Error(errorMessage(status, body));
  if (!Array.isArray(body?.data)) throw new Error('La respuesta de viajes no contiene una lista válida.');
  return { trips: body.data, nextCursor: body.next_cursor ?? null };
}

export const getTrip = (routeId: string) => call<TripDetail>(`${BASE}/viajes/${routeId}`);

export const recordIncident = (returnId: string, explanation: string, idempotencyKey: string) =>
  call<{incident: {id: string;explanation: string};trip: ReturnTrip}>(`${BASE}/${encodeURIComponent(returnId)}/novedades`, {
    method:'POST',body:JSON.stringify({explanation,idempotency_key:idempotencyKey}),
  });

export const receiveReturn = (returnId: string, quantity: number, condition: ReturnCondition) =>
  call<{ return: unknown; trip: ReturnTrip }>(`${BASE}/${returnId}/recibir`, send('POST', { received_quantity: quantity, condition }));

export const rejectReturn = (returnId: string, reason: string) =>
  call<{ return: unknown; trip: ReturnTrip }>(`${BASE}/${returnId}/rechazar`, send('POST', { reason }));

export const receiveAll = (routeId: string, condition: ReturnCondition) =>
  call<{ received: number; trip: ReturnTrip }>(`${BASE}/viajes/${routeId}/recibir-todas`, send('POST', { condition }));

/** Formulario nuevo SOLO con las devoluciones marcadas. */
export const createForm = (routeId: string, returnIds: string[], draft: FormDraft) =>
  call<FormView>(`${BASE}/viajes/${routeId}/formularios`, send('POST', { ...draft, return_ids: returnIds }));

export const getForm = (formId: string) => call<FormView>(`${BASE}/formularios/${formId}`);

export const updateForm = (formId: string, draft: FormDraft) =>
  call<FormView>(`${BASE}/formularios/${formId}`, send('PUT', draft));
