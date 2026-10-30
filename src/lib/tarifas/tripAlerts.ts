// Alertas de un viaje para la bandeja de liquidaciones: qué trae el viaje que conviene revisar.

import type { TripRecord } from './types';

export interface TripAlert {
  code: 'NOVEDADES' | 'RECOLECTAS' | 'RETURNS' | 'UNDELIVERED';
  label: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type TripAlertInput = Pick<TripRecord, 'guideCount' | 'deliveredGuides' | 'returnCount' | 'novedadCount' | 'pickupCount'>;

export function tripAlerts(trip: TripAlertInput): TripAlert[] {
  const undelivered = Math.max(0, trip.guideCount - trip.deliveredGuides);
  const alerts: TripAlert[] = [];
  if (trip.novedadCount > 0) alerts.push({ code: 'NOVEDADES', label: plural(trip.novedadCount, 'novedad', 'novedades') });
  if (trip.pickupCount > 0) alerts.push({ code: 'RECOLECTAS', label: plural(trip.pickupCount, 'recolecta', 'recolectas') });
  if (trip.returnCount > 0) alerts.push({ code: 'RETURNS', label: plural(trip.returnCount, 'devolución', 'devoluciones') });
  if (undelivered > 0) alerts.push({ code: 'UNDELIVERED', label: plural(undelivered, 'pedido no entregado', 'pedidos no entregados') });
  return alerts;
}
