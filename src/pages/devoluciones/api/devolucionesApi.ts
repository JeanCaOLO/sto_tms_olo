// Cliente de la API de devoluciones (backend/admin, /api/v1/devoluciones/*).
import { apiFetch } from '../../../lib/api-client';
import type {
  FormDraft, FormView, ReturnCondition, ReturnSummary, ReturnTrip, TripDetail, TripFilter,
} from '../../../lib/devoluciones/types';

const BASE = '/v1/devoluciones';

type FetchInit = NonNullable<Parameters<typeof apiFetch>[1]>;

function errorMessage(status: number, body: any): string {
  return body?.error?.message ?? body?.message ?? `Error ${status}`;
}

async function call<T>(path: string, init: FetchInit = {}): Promise<T> {
  const { ok, status, body } = await apiFetch(path, init);
  if (!ok) throw new Error(errorMessage(status, body));
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
}

export const getSummary = () => call<ReturnSummary>(`${BASE}/resumen`);

export function listTrips({ state, from, to }: TripQuery) {
  const params = new URLSearchParams({ estado: state });
  if (from) params.set('desde', from);
  if (to) params.set('hasta', to);
  return call<ReturnTrip[]>(`${BASE}/viajes?${params.toString()}`);
}

export const getTrip = (routeId: string) => call<TripDetail>(`${BASE}/viajes/${routeId}`);

export const receiveReturn = (returnId: string, quantity: number, condition: ReturnCondition) =>
  call<{ return: unknown; trip: ReturnTrip }>(`${BASE}/${returnId}/recibir`, send('POST', { received_quantity: quantity, condition }));

export const receiveAll = (routeId: string, condition: ReturnCondition) =>
  call<{ received: number; trip: ReturnTrip }>(`${BASE}/viajes/${routeId}/recibir-todas`, send('POST', { condition }));

/** Formulario nuevo SOLO con las devoluciones marcadas. */
export const createForm = (routeId: string, returnIds: string[], draft: FormDraft) =>
  call<FormView>(`${BASE}/viajes/${routeId}/formularios`, send('POST', { ...draft, return_ids: returnIds }));

export const getForm = (formId: string) => call<FormView>(`${BASE}/formularios/${formId}`);

export const updateForm = (formId: string, draft: FormDraft) =>
  call<FormView>(`${BASE}/formularios/${formId}`, send('PUT', draft));
