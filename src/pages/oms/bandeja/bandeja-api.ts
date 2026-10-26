// Fuente de datos de "Pedidos en Bandeja" (módulo PLANIFICACIÓN, montado en el
// sidebar del OMS). Lee del backend de Planificación vía apiFetch — NO del OMS:
//   GET /api/v1/planificacion/bandeja  → { data: BandejaRow[], error }
// Son TODOS los pedidos DISP/DISP de eFlow ya guardados en orders; el planificador
// luego toma solo los que caen en su ventana de días. El scope (almacén/compañía)
// lo adjunta apiFetch como headers desde el contexto operativo.
import { apiFetch } from '../../../lib/supabase';
import type { QueueOrder } from '../types';

interface BandejaRow {
  id: string;
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
}

// La bandeja no prioriza: tier/score/estado-OMS van en neutro (esas columnas se
// quitaron de la vista). Solo se llenan los campos que la tabla y el modal muestran.
function toQueueOrder(r: BandejaRow): QueueOrder {
  return {
    id: r.id,
    ref: r.eflow_id_expedicion ?? '',
    warehouseId: r.eflow_id_almacen ?? '',
    companyId: r.eflow_id_compania ?? '',
    branchId: r.eflow_id_sucursal ?? '',
    orderType: '',
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
  };
}

export async function fetchBandeja(): Promise<QueueOrder[]> {
  const { ok, body } = await apiFetch('/v1/planificacion/bandeja');
  const data = body?.data as BandejaRow[] | undefined;
  if (!ok || !Array.isArray(data)) return [];
  return data.map(toQueueOrder);
}
