// T-1 DINÁMICO (reunión Antonio/Jean 2026-10-15): la planificación calcula el
// tiempo logístico de viaje POR CLUSTER (zona) y de ahí la fecha de alistamiento
// = fecha de ENTREGA − ese tiempo. El OMS lo CONSUME para la prioridad. Antes era
// T-1 fijo (1 día); ahora es T-n por zona, calculado hacia atrás desde la entrega.
// ponytail: tabla por zona a mano; es el knob de calibración — se reemplaza por
// el tiempo real de ruta (CR ~1 día; VE ~40+ rutas a definir con comercial).

import { addDays, format } from 'date-fns';

const DIAS_POR_ZONA: Record<string, number> = {
  'Zona 1': 1,
  'Zona 2': 1,
  'Zona 3': 1,
  'Zona 4': 2, // San Carlos / La Fortuna: ruta larga
};

const DIAS_POR_DEFECTO = 1;

// Tiempo logístico de viaje del cluster (días). Zona desconocida → por defecto.
export function tiempoViajeDias(zona: string | null | undefined): number {
  if (!zona) return DIAS_POR_DEFECTO;
  return DIAS_POR_ZONA[zona] ?? DIAS_POR_DEFECTO;
}

// Fecha en que hay que ALISTAR = entrega − tiempo de viaje del cluster (YYYY-MM-DD).
export function fechaAlistamiento(fechaEntregaISO: string, zona: string | null | undefined): string {
  const dias = tiempoViajeDias(zona);
  return format(addDays(new Date(`${fechaEntregaISO}T00:00:00`), -dias), 'yyyy-MM-dd');
}
