import { apiFetch } from '../../lib/api-client';

// Línea/artículo de un pedido (order_items), para el detalle y el impreso de la guía.
export interface Articulo {
  product_code: string;
  product_name: string;
  quantity: number;
  weight: number | null;
  volume: number | null;
  guia_fiscal: string | null;
}

// Artículos (líneas) de un pedido.
//   GET /api/v1/planificacion/pedidos/{order_id}/articulos → { data: Articulo[] }
// Sin backend o pedido mock, devuelve [] (la guía muestra "sin artículos").
export async function fetchArticulosDePedido(orderId: string): Promise<Articulo[]> {
  try {
    const { ok, body } = await apiFetch(`/v1/planificacion/pedidos/${orderId}/articulos`);
    const data = body?.data as Articulo[] | undefined;
    return ok && Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
