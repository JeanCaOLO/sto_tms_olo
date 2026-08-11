import { supabase } from '../../lib/supabase';
import type { AppUser } from '../../lib/mock-auth';
import type { PedidoSeleccionado, Vehiculo } from './types';

export interface GenerarRutaParams {
  appUser: AppUser;
  vehiculo: Vehiculo;
  pedidosSeleccionados: PedidoSeleccionado[];
  rutaTypeId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
}

export async function generarRutaEnDb({
  appUser, vehiculo, pedidosSeleccionados, rutaTypeId, conductorId, vehiculoId, fechaRuta,
}: GenerarRutaParams): Promise<{ routeNumber: string }> {
  const totalWeight = pedidosSeleccionados.reduce((s, p) => s + (p.total_weight || 0), 0);
  const totalVolume = pedidosSeleccionados.reduce((s, p) => s + (p.total_volume || 0), 0);
  const storeId = pedidosSeleccionados[0].store_id;

  const { data: conductorData } = await supabase
    .from('drivers')
    .select('carrier_id')
    .eq('id', conductorId)
    .maybeSingle();

  const { data: rutaData, error: rutaError } = await supabase
    .from('routes')
    .insert({
      route_number: `RT-${Date.now()}`,
      route_date: fechaRuta,
      store_id: storeId,
      driver_id: conductorId,
      vehicle_id: vehiculoId,
      carrier_id: conductorData?.carrier_id,
      route_type_id: rutaTypeId,
      status: 'Planificada',
      total_stops: pedidosSeleccionados.length,
      completed_stops: 0,
      total_weight: totalWeight,
      total_volume: totalVolume,
      capacity_percentage: Math.round((totalWeight / vehiculo.capacity_kg) * 100),
      organization_id: appUser.organization_id,
    })
    .select()
    .single();

  if (rutaError) throw rutaError;

  await Promise.all(
    pedidosSeleccionados.map((pedido) =>
      supabase.from('dispatch_guides').insert({
        guide_number: `GD-${Date.now()}-${pedido.stop_number}`,
        route_id: rutaData.id,
        order_id: pedido.id,
        sequence_number: pedido.stop_number,
        status: 'Pendiente',
        organization_id: appUser.organization_id,
      }),
    ),
  );

  await Promise.all(
    pedidosSeleccionados.map((pedido) =>
      supabase.from('orders').update({ status: 'Asignado' }).eq('id', pedido.id),
    ),
  );

  return { routeNumber: rutaData.route_number };
}
