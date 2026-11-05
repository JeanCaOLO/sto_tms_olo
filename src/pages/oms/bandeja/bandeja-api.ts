// Fuente de datos de "Pedidos en Bandeja" (módulo PLANIFICACIÓN, montado en el
// sidebar del OMS). Lee del backend de Planificación vía apiFetch — NO del OMS:
//   GET  /api/v1/planificacion/bandeja                    → { data: BandejaRow[], error }
//   POST /api/v1/planificacion/pedidos/{id}/fecha-entrega → cambia la fecha (solo admin)
// delivery = pedidos DISP/DISP de eFlow ya guardados en orders; pickup = devoluciones
// abiertas (creadas en el TMS o en la app) que hay que pasar a recoger. El scope
// (almacén/compañía) lo adjunta apiFetch como headers desde el contexto operativo.
import { apiFetch } from '../../../lib/api-client';
import type { QueueOrder } from '../types';

export type BandejaKind = 'delivery' | 'pickup';

interface BandejaRow {
  id: string;
  kind: BandejaKind;
  return_number: string | null;
  return_reason: string | null;
  return_status: string | null;
  eflow_id_expedicion: string | null;
  eflow_id_almacen: string | null;
  eflow_id_compania: string | null;
  eflow_id_sucursal: string | null;
  final_customer_name: string | null;
  delivery_zone: string | null;
  total_amount: number | null;
  total_weight: number | null;
  total_volume: number | null;
  total_items: number | null;
  observaciones: string | null;
  delivery_date: string | null;
  order_date: string | null;
  wms_status: string | null;
  wms_situation: string | null;
  delivery_date_eflow: string | null;
  delivery_date_change_count: number | null;
  liberado: boolean | null;
}

// Fila de la bandeja: el pedido con la forma de la Cola + lo propio de la bandeja.
export interface BandejaOrder extends QueueOrder {
  kind: BandejaKind;
  returnNumber: string;
  returnReason: string;
  /** Fecha que manda eFlow; distinta de dispatchDate si un admin la cambió. */
  eflowDate: string;
  dateChanges: number;
  /** Ya liberado a eFlow por el OMS: su fecha no se puede cambiar. */
  released: boolean;
}

// La bandeja no prioriza: tier/score/estado-OMS van en neutro (esas columnas se
// quitaron de la vista). Solo se llenan los campos que la tabla y el modal muestran.
function toBandejaOrder(r: BandejaRow): BandejaOrder {
  return {
    id: r.id,
    ref: r.kind === 'pickup' ? (r.return_number ?? '') : (r.eflow_id_expedicion ?? ''),
    warehouseId: r.eflow_id_almacen ?? '',
    companyId: r.eflow_id_compania ?? '',
    branchId: r.eflow_id_sucursal ?? '',
    orderType: r.kind,
    customer: r.final_customer_name ?? '',
    route: r.delivery_zone || '(sin zona)',
    country: 'CR',
    tier: 1,
    score: 0,
    totalAmount: Number(r.total_amount ?? 0),
    weight: Number(r.total_weight ?? 0),
    volume: Number(r.total_volume ?? 0),
    itemCount: r.total_items ?? 0,
    observations: r.observaciones ?? '',
    dispatchDate: (r.delivery_date ?? '').slice(0, 10),
    createdDate: (r.order_date ?? '').slice(0, 10),
    status: r.wms_status ?? '',
    situation: r.wms_situation ?? '',
    intakeTime: '',
    appliedRules: [],
    history: [],
    kind: r.kind,
    returnNumber: r.return_number ?? '',
    returnReason: r.return_reason ?? '',
    eflowDate: (r.delivery_date_eflow ?? '').slice(0, 10),
    dateChanges: r.delivery_date_change_count ?? 0,
    released: Boolean(r.liberado),
  };
}

export async function fetchBandeja(): Promise<BandejaOrder[]> {
  const { ok, body } = await apiFetch('/v1/planificacion/bandeja');
  const data = body?.data as BandejaRow[] | undefined;
  if (!ok || !Array.isArray(data)) return [];
  return data.map(toBandejaOrder);
}

// Cambia la fecha de entrega (solo admin; el backend lo valida). Devuelve el mensaje
// de error del backend, o null si salió bien.
export async function cambiarFechaEntrega(orderId: string, fecha: string): Promise<string | null> {
  const { ok, body } = await apiFetch(`/v1/planificacion/pedidos/${orderId}/fecha-entrega`, {
    method: 'POST',
    body: JSON.stringify({ delivery_date: fecha }),
  });
  return ok ? null : (body?.error?.message ?? 'No se pudo cambiar la fecha');
}
