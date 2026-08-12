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

// ponytail: sequential greedy fill — sorts vehicles largest-capacity-first,
// fills each one via the same 2D bin-packing used for a single vehicle
// (capacity-fit.ts), then moves to the next with whatever's left over. Not a
// true multi-bin optimum (multi-vehicle VRP/bin-packing is NP-hard too), but
// gives a usable fleet split for the fleet sizes this business runs (a
// handful of vehicles, ≤50 stops). Upgrade: best-fit-across-bins or a real
// solver if uneven fill becomes a practical problem.
export function repartirEntreFlota(pedidos: Pedido[], slots: FlotaSlot[]): ResultadoReparto {
  const slotsOrdenados = [...slots].sort((a, b) => b.vehiculo.capacity_weight - a.vehiculo.capacity_weight);

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
