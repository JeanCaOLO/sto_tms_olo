import { supabase } from '../../lib/supabase';
import type { AppUser } from '../../lib/mock-auth';
import { getFallbackPedidos } from './fallback-pedidos';
import type { Pedido } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchPedidosDeRuta(appUser: AppUser, routeTypeId: string): Promise<Pedido[]> {
  // `orders.route_type_id` es uuid. Los ids del catálogo EFLOW ("eflow-rt-08")
  // no lo son y jamás casarían — consultarlos solo produce un 400 de Postgres.
  // Vamos directo al pool mock (que es lo que el prototipo usa de todos modos).
  if (!UUID_RE.test(routeTypeId)) return getFallbackPedidos(routeTypeId);

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(name), stores(name)')
      .eq('route_type_id', routeTypeId)
      .eq('status', 'pending')
      .eq('organization_id', appUser.organization_id)
      .order('order_date', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) return getFallbackPedidos(routeTypeId);

    return data.map((p: any) => ({
      ...p,
      customer_name: p.customers?.name,
      store_name: p.stores?.name,
    }));
  } catch (err) {
    // Mismo patrón de resiliencia que catalogos-api / eflow-api: si `orders` no
    // responde (sin backend, RLS, o `route_type_id` es un id eflow no-uuid como
    // "eflow-rt-08" → error de sintaxis uuid), caemos al pool mock en vez de
    // dejar el reparto de flota sin pedidos.
    console.warn('[planificacion] orders no disponible, usando pedidos mock:', (err as Error).message);
    return getFallbackPedidos(routeTypeId);
  }
}
