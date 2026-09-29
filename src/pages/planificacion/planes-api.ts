// Capa de datos de los planes de rutas persistidos (contrato §4, prefijo
// /api/v1/planificacion). El backend Aurora corre el motor y persiste; si no
// responde, se cae al store mock (planes-mock.ts) para poder ver/editar la UI
// sin backend, igual que hace plan-pedidos-api.ts con los pedidos.
//
//   POST   /planes                 {plan_date}      → arma y persiste draft
//   GET    /planes?status=&fecha=                    → lista para la pestaña
//   GET    /planes/{id}                              → un plan con trips+stops
//   PUT    /planes/{id}            {trips:[...]}      → editar (solo draft)
//   POST   /planes/{id}/confirmar                    → draft→confirmed
//   POST   /planes/{id}/completar                    → confirmed→completed
//   POST   /planes/{id}/cancelar                     → →cancelled
//
// Envoltura {data,error} vía apiFetch. País/almacén salen del contexto operativo.

import { apiFetch } from '../../lib/supabase';
import type { Conductor, Pedido, Vehiculo } from './types';
import type { PlanEditPayload, PlanStatus, RoutePlan } from './planes-types';
import {
  construirDraft,
  editarMock,
  listarMock,
  obtenerMock,
  transicionarMock,
} from './planes-mock';

const BASE = '/v1/planificacion/planes';

// Contexto local para el fallback mock: cuando el backend no está, el motor
// cliente necesita los pedidos del día + la flota para armar el draft.
export interface MockContext {
  pedidos: Pedido[];
  vehiculos: Vehiculo[];
  conductores: Conductor[];
  countryId: string | null;
  warehouseId: string | null;
}

function esPlan(v: unknown): v is RoutePlan {
  return Boolean(v) && typeof v === 'object' && 'id' in (v as object) && 'trips' in (v as object);
}

export async function generarPlan(planDate: string, ctx: MockContext): Promise<RoutePlan> {
  try {
    const { ok, body } = await apiFetch(BASE, {
      method: 'POST',
      body: JSON.stringify({ plan_date: planDate }),
    });
    if (ok && esPlan(body?.data)) return body.data;
  } catch {
    // cae al mock
  }
  return construirDraft(planDate, ctx);
}

export async function listarPlanes(status?: PlanStatus, fecha?: string): Promise<RoutePlan[]> {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (fecha) qs.set('fecha', fecha);
  const suffix = qs.toString() ? `?${qs}` : '';
  try {
    const { ok, body } = await apiFetch(`${BASE}${suffix}`);
    const data = body?.data as RoutePlan[] | undefined;
    // Si el backend respondió, esa es la verdad — una lista vacía es válida (no
    // caer a mock, que dejaba planes stale tras completar/cancelar). El mock
    // solo aplica cuando el backend NO respondió.
    if (ok && Array.isArray(data)) return data;
    return listarMock(status, fecha);
  } catch {
    return listarMock(status, fecha);
  }
}

export async function obtenerPlan(id: string): Promise<RoutePlan | null> {
  try {
    const { ok, body } = await apiFetch(`${BASE}/${id}`);
    if (ok && esPlan(body?.data)) return body.data;
  } catch {
    // cae al mock
  }
  return obtenerMock(id) ?? null;
}

export async function editarPlan(id: string, payload: PlanEditPayload): Promise<RoutePlan | null> {
  try {
    const { ok, body } = await apiFetch(`${BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (ok && esPlan(body?.data)) return body.data;
  } catch {
    // cae al mock
  }
  return editarMock(id, payload) ?? null;
}

async function transicionar(id: string, accion: string, destino: PlanStatus): Promise<RoutePlan | null> {
  try {
    const { ok, body } = await apiFetch(`${BASE}/${id}/${accion}`, { method: 'POST' });
    if (ok && esPlan(body?.data)) return body.data;
  } catch {
    // cae al mock
  }
  return transicionarMock(id, destino) ?? null;
}

export const confirmarPlan = (id: string) => transicionar(id, 'confirmar', 'confirmed');
export const completarPlan = (id: string) => transicionar(id, 'completar', 'completed');
export const cancelarPlan = (id: string) => transicionar(id, 'cancelar', 'cancelled');
