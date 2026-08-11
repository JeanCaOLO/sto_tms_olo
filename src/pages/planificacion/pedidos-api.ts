import { supabase } from '../../lib/supabase';
import type { AppUser } from '../../lib/mock-auth';
import type { Pedido } from './types';

export async function fetchPedidosDeRuta(appUser: AppUser, routeTypeId: string): Promise<Pedido[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(name), stores(name)')
    .eq('route_type_id', routeTypeId)
    .eq('status', 'pending')
    .eq('organization_id', appUser.organization_id)
    .order('order_date', { ascending: true });

  if (error) throw error;

  return (data || []).map((p: any) => ({
    ...p,
    customer_name: p.customers?.name,
    store_name: p.stores?.name,
  }));
}
