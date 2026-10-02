import { seleccionarPorCapacidad } from './capacity-fit';
import { optimizarParadas, withStopNumbers } from './optimize-stops';
import type { Pedido, PedidoSeleccionado, Vehiculo } from './types';

export interface FlotaSlot {
  vehiculo: Vehiculo;
  conductorId: string;
}

export interface AsignacionFlota {
  slot: FlotaSlot;
  pedidos: PedidoSeleccionado[];
}

export interface ResultadoReparto {
  asignaciones: AsignacionFlota[];
  sinAsignar: Pedido[];
}

// Flota propia primero (mandato Jean Carlo, 2026-09-21: "prioridad a flota
// propia" - ver project.md), luego por capacidad descendente - reutilizado
// también por el disparador automático de viajes (ver viaje-trigger.ts) para
// no duplicar el criterio de prioridad de flota.
export function compararPrioridadFlota(a: FlotaSlot, b: FlotaSlot): number {
  const propiaA = a.vehiculo.is_flota_propia ? 1 : 0;
  const propiaB = b.vehiculo.is_flota_propia ? 1 : 0;
  if (propiaA !== propiaB) return propiaB - propiaA;
  return b.vehiculo.capacity_weight - a.vehiculo.capacity_weight;
}

// El mejor slot disponible según el mismo criterio (flota propia > capacidad).
// null si no hay ninguno disponible - el llamador decide qué hacer (dejar el
// viaje "propuesto sin flota" en vez de fallar).
export function asignarFlota(slotsDisponibles: FlotaSlot[]): FlotaSlot | null {
  if (slotsDisponibles.length === 0) return null;
  return [...slotsDisponibles].sort(compararPrioridadFlota)[0];
}

// ponytail: sequential greedy fill — sorts vehicles flota-propia-first, then
// by descending capacity within each group, fills each one via the same 2D
// bin-packing used for a single vehicle (capacity-fit.ts), then moves to the
// next with whatever's left over. Not a true multi-bin optimum (multi-vehicle
// VRP/bin-packing is NP-hard too), but gives a usable fleet split for the
// fleet sizes this business runs (a handful of vehicles, ≤50 stops). Upgrade:
// best-fit-across-bins or a real solver if uneven fill becomes a problem.
export function repartirEntreFlota(pedidos: Pedido[], slots: FlotaSlot[]): ResultadoReparto {
  const slotsOrdenados = [...slots].sort(compararPrioridadFlota);

  let restante: PedidoSeleccionado[] = withStopNumbers(pedidos);
  const asignaciones: AsignacionFlota[] = [];

  for (const slot of slotsOrdenados) {
    if (restante.length === 0) break;
    const { incluidos, excluidos } = seleccionarPorCapacidad(restante, slot.vehiculo);
    if (incluidos.length > 0) {
      asignaciones.push({ slot, pedidos: withStopNumbers(optimizarParadas(incluidos)) });
    }
    restante = withStopNumbers(excluidos);
  }

  return { asignaciones, sinAsignar: restante };
}
