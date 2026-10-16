// Lógica pura de la vista Calendario de planificación (sin React, testeable).
// La matriz es ZONAS (filas) × DÍAS (columnas); en cada celda van los viajes de
// esa fecha+zona. Día/Semana/Mes solo cambian el rango de fechas visible.
// El modelo que se renderiza es RoutePlan[] (plan_date = columna, trip.delivery_zone
// = fila); ver planes-types.ts. El contenido de cada celda lo dibuja PlanTripCard.

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { PlanTrip, RoutePlan } from './planes-types';

export type VistaCalendario = 'dia' | 'semana' | 'mes';

// Semana que arranca en lunes (como el pizarrón del cliente: L M M J V …).
const OPC_SEMANA = { weekStartsOn: 1 as const };

export function isoDe(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// Columnas de la vista semana: lunes..sábado (6). El dibujo usa L-V; agregamos
// sábado porque hay entregas ese día.
export function diasSemana(ancla: Date): Date[] {
  const inicio = startOfWeek(ancla, OPC_SEMANA);
  return Array.from({ length: 6 }, (_, i) => addDays(inicio, i));
}

// Celdas de la vista mes: semanas completas (lun..dom) que cubren el mes.
export function diasMes(ancla: Date): Date[] {
  const inicio = startOfWeek(startOfMonth(ancla), OPC_SEMANA);
  const fin = endOfWeek(endOfMonth(ancla), OPC_SEMANA);
  return eachDayOfInterval({ start: inicio, end: fin });
}

// Todos los viajes de una fecha (de todos los planes de ese día).
export function viajesDeFecha(planes: RoutePlan[], fechaISO: string): PlanTrip[] {
  return planes.filter((p) => p.plan_date === fechaISO).flatMap((p) => p.trips);
}

// Viajes de una celda = una fecha + una zona.
export function viajesDeCelda(planes: RoutePlan[], fechaISO: string, zonaCodigo: string): PlanTrip[] {
  return viajesDeFecha(planes, fechaISO).filter((t) => t.delivery_zone === zonaCodigo);
}

// Filtra los planes a un subconjunto de zonas: deja fuera los viajes de otras
// zonas y los planes que quedan sin viajes. Set vacío = sin filtro (todo).
export function filtrarPorZonas(planes: RoutePlan[], zonas: Set<string>): RoutePlan[] {
  if (zonas.size === 0) return planes;
  return planes
    .map((p) => ({ ...p, trips: p.trips.filter((t) => zonas.has(t.delivery_zone)) }))
    .filter((p) => p.trips.length > 0);
}

// Zonas (códigos) presentes en el rango visible, ordenadas. Son las filas.
export function zonasPresentes(planes: RoutePlan[], fechasISO: string[]): string[] {
  const visibles = new Set(fechasISO);
  const zonas = new Set<string>();
  for (const p of planes) {
    if (!visibles.has(p.plan_date)) continue;
    for (const t of p.trips) zonas.add(t.delivery_zone);
  }
  return [...zonas].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

// ¿Alguno de estos viajes lleva pedidos aún NO despachados (fuera de CARCA)?
// La vista lo usa para marcar una advertencia (reunión Antonio 2026-10-15).
export function hayPendientesCarca(trips: PlanTrip[]): boolean {
  return trips.some((t) => t.stops.some((s) => s.en_carca === false));
}

// Numeración global de viajes (V1, V2…) en el rango visible, en orden
// (fecha asc, zona asc, sequence_order asc) — tal como el pizarrón del cliente.
export function numeroDeViaje(planes: RoutePlan[], fechasISO: string[]): Map<string, number> {
  const zonas = zonasPresentes(planes, fechasISO);
  const fechas = [...new Set(fechasISO)].sort();
  const mapa = new Map<string, number>();
  let n = 0;
  for (const f of fechas) {
    for (const z of zonas) {
      const viajes = viajesDeCelda(planes, f, z).sort((a, b) => a.sequence_order - b.sequence_order);
      for (const v of viajes) mapa.set(v.id, ++n);
    }
  }
  return mapa;
}
