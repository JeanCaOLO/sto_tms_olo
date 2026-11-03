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
// llegan null (capacity_known=false) hasta que EFLOW pase a live. Sin backend,
// en desarrollo cae al pool mock; en producción lanza (ver mock-fallback.ts).

import { apiFetch } from '../../lib/supabase';
import { getFallbackPedidosParaPlanificar, offsetDayIso } from './fallback-pedidos';
import { mockFallbackEnabled } from './mock-fallback';
import type { Articulo, Pedido } from './types';

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
  // Solo en desarrollo cae a mock si el backend no respondió; en producción lanza para que la UI
  // muestre el error. Un día real sin pedidos = 0 (nunca mock).
  const alFallar = (motivo: string): Pedido[] => {
    if (mockFallbackEnabled()) return getFallbackPedidosParaPlanificar(fechaEntrega);
    throw new Error(motivo);
  };
  let respuesta: Awaited<ReturnType<typeof apiFetch>>;
  try {
    respuesta = await apiFetch(`/v1/planificacion/pedidos?fecha_entrega=${fechaEntrega}`);
  } catch {
    return alFallar('No se pudo conectar con el servidor de pedidos.');
  }
  const data = respuesta.body?.data as PedidoRow[] | undefined;
  if (!respuesta.ok || !Array.isArray(data)) {
    return alFallar(`No se pudieron cargar los pedidos (HTTP ${respuesta.status}).`);
  }
  return data.map(normalizar);
}

// Artículos (líneas) de un pedido, para el modal de detalle del pin.
//   GET /api/v1/planificacion/pedidos/{order_id}/articulos → { data: Articulo[] }
// Sin backend o pedido mock, devuelve [] (el modal muestra "sin artículos").
export async function fetchArticulosDePedido(orderId: string): Promise<Articulo[]> {
  try {
    const { ok, body } = await apiFetch(`/v1/planificacion/pedidos/${orderId}/articulos`);
    const data = body?.data as Articulo[] | undefined;
    return ok && Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
