import type { PlanStatus, PlanTrip, RoutePlan } from '../planificacion/planes-types';

// La guía de despacho es el RESULTADO de la planificación: 1 guía = 1 viaje
// (plan_trip) de un plan CONFIRMADO o COMPLETADO ("básicamente la ruta", daily
// 2026-10-08). Se deriva del backend real de planificación, no de Supabase.
export interface Guia {
  id: string; // trip.id
  guide_number: string;
  plan_date: string;
  plan_status: PlanStatus;
  zona: string;
  conductor: string;
  vehiculo: string;
  paradas: number;
  peso: number | null;
  trip: PlanTrip;
}

export const ESTADOS: { key: 'all' | 'confirmed' | 'completed'; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'completed', label: 'Completadas' },
];

// G-{fecha}-{NN}: número de guía DERIVADO (no persistido). Determinístico por
// plan+viaje; si tracking llega a necesitar uno estable se persiste después.
export function guideNumber(plan: RoutePlan, trip: PlanTrip): string {
  return `G-${plan.plan_date}-${String(trip.sequence_order).padStart(2, '0')}`;
}

export interface TotalesGuia {
  paradas: number;
  pedidos: number; // 1 parada = 1 pedido
  peso: number;
  volumen: number | null; // null si ninguna parada trae volumen (no mostrar 0 falso)
}

export function totalesDeGuia(guia: Guia): TotalesGuia {
  const stops = guia.trip.stops;
  const hayVol = stops.some((s) => s.total_volume != null);
  return {
    paradas: stops.length,
    pedidos: stops.length,
    peso: stops.reduce((a, s) => a + (s.total_weight ?? 0), 0),
    volumen: hayVol ? stops.reduce((a, s) => a + (s.total_volume ?? 0), 0) : null,
  };
}

// Aplana los viajes de los planes confirmados/completados en guías.
export function planesToGuias(
  planes: RoutePlan[],
  nombreDe: (z: string) => string | undefined,
  conductorNombre: Map<string, string>,
): Guia[] {
  const out: Guia[] = [];
  for (const plan of planes) {
    if (plan.status !== 'confirmed' && plan.status !== 'completed') continue;
    for (const trip of plan.trips) {
      out.push({
        id: trip.id,
        guide_number: guideNumber(plan, trip),
        plan_date: plan.plan_date,
        plan_status: plan.status,
        zona: nombreDe(trip.delivery_zone) || trip.delivery_zone,
        conductor: (trip.driver_id && conductorNombre.get(trip.driver_id)) || '—',
        vehiculo: trip.vehicle_plate || trip.vehicle_label || '—',
        paradas: trip.stops.length,
        peso: trip.total_weight,
        trip,
      });
    }
  }
  return out;
}
