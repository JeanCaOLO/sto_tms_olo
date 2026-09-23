// Fuente de datos del flujo de planificación automática: los pedidos que el
// OMS dejó alistados (situacion 'GENE' en wms_expediciones) con fecha de
// entrega comprometida = el día objetivo (por defecto mañana). Endpoint real
// provisto por Claude (ver .agents/CANAL.md).
//
//   GET /api/v1/planificacion/pedidos?fecha_entrega=YYYY-MM-DD
//   → { data: Pedido[], error }   (mismo envoltorio que /api/data, vía apiFetch)
//
// Notas del backend (CANAL.md): delivery_date llega como ISO con hora
// (medianoche UTC) → se normaliza a YYYY-MM-DD; total_weight/total_volume
// llegan null (capacity_known=false) hasta que EFLOW pase a live. Sin backend
// o sin datos, cae al pool mock.

import { apiFetch } from '../../lib/supabase';
import { getFallbackPedidosParaPlanificar, offsetDayIso } from './fallback-pedidos';
import type { Pedido } from './types';

// Día objetivo por defecto: mañana (hoy + 1).
export function fechaEntregaObjetivo(): string {
  return offsetDayIso(1);
}

interface PedidoRow extends Omit<Pedido, 'delivery_date'> {
  delivery_date: string; // ISO con hora
}

function normalizar(row: PedidoRow): Pedido {
  return { ...row, delivery_date: (row.delivery_date || '').slice(0, 10) };
}

export async function fetchPedidosParaPlanificar(
  fechaEntrega: string = fechaEntregaObjetivo(),
): Promise<Pedido[]> {
  try {
    const { ok, body } = await apiFetch(`/v1/planificacion/pedidos?fecha_entrega=${fechaEntrega}`);
    const data = body?.data as PedidoRow[] | undefined;
    if (!ok || !Array.isArray(data) || data.length === 0) {
      return getFallbackPedidosParaPlanificar(fechaEntrega);
    }
    return data.map(normalizar);
  } catch {
    return getFallbackPedidosParaPlanificar(fechaEntrega);
  }
}
