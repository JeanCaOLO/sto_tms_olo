// T-n DINÁMICO (reunión Antonio/Jean 2026-10-15): la planificación calcula el
// tiempo logístico de viaje del CLUSTER a partir de la DISTANCIA REAL de su
// parada más lejana al depósito de origen, y de ahí la fecha de alistamiento
// = entrega − ese tiempo. El OMS lo CONSUME para la prioridad (regla T-1). Antes
// era una tabla fija por zona; ahora sale de las coordenadas reales del viaje.

import { addDays, format } from 'date-fns';
import { haversineKm } from '../../lib/routePlanning/haversine';
import type { PlanTrip } from './planes-types';

// Depósito (bodega) de origen. Hoy solo CR (San José, GAM). Junto con KM_POR_DIA
// es el KNOB de calibración: ajustar cuando exista depósito real por país/almacén.
const DEPOT_CR = { id: 'depot', lat: 9.9281, lng: -84.0907, weightKg: 0, volumeM3: 0 };
// Alcance en línea recta de UNA jornada (absorbe el rodeo de calle, la velocidad
// y las horas de corte). Cada tramo extra de este alcance ⇒ un día más de viaje.
const KM_POR_DIA = 70;
const DIAS_POR_DEFECTO = 1;

// Distancia (km, línea recta) de la parada más lejana del viaje al depósito.
// Sin coordenadas en ninguna parada → null (se cae al tiempo por defecto).
function distanciaMaxKm(trip: PlanTrip): number | null {
  const kms = trip.stops
    .filter((s) => s.delivery_latitude != null && s.delivery_longitude != null)
    .map((s) =>
      haversineKm(DEPOT_CR, {
        id: s.id,
        lat: s.delivery_latitude!,
        lng: s.delivery_longitude!,
        weightKg: 0,
        volumeM3: 0,
      }),
    );
  return kms.length ? Math.max(...kms) : null;
}

// Tiempo logístico de viaje del cluster (días), dinámico por distancia real.
export function tiempoViajeDias(trip: PlanTrip): number {
  const km = distanciaMaxKm(trip);
  if (km == null) return DIAS_POR_DEFECTO;
  return 1 + Math.floor(km / KM_POR_DIA);
}

// Fecha en que hay que ALISTAR = entrega − tiempo de viaje del cluster (YYYY-MM-DD).
export function fechaAlistamiento(fechaEntregaISO: string, trip: PlanTrip): string {
  const dias = tiempoViajeDias(trip);
  return format(addDays(new Date(`${fechaEntregaISO}T00:00:00`), -dias), 'yyyy-MM-dd');
}
