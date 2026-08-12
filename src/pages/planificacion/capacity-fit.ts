import { optimizarParadas, withStopNumbers } from './optimize-stops';
import type { PedidoSeleccionado, Vehiculo } from './types';

const SAFETY_MARGIN = 0.93;

function cargaRelativa(pedido: PedidoSeleccionado, vehiculo: Vehiculo): number {
  return Math.max(
    (pedido.total_weight || 0) / vehiculo.capacity_weight,
    (pedido.total_volume || 0) / vehiculo.capacity_volume,
  );
}

// ponytail: greedy first-fit-decreasing bin packing, not an exact 2D knapsack
// solve (NP-hard). Good enough for route sizes here (≤50 stops per the
// planning research doc). Ceiling: can leave capacity on the table for some
// weight/volume combinations. Upgrade: real 2D knapsack DP or ILP if this
// needs to be exact later. Caps at 93% of nominal capacity (safety margin),
// not the raw max, per the operational request.
export function seleccionarPorCapacidad(
  pedidos: PedidoSeleccionado[],
  vehiculo: Vehiculo,
): { incluidos: PedidoSeleccionado[]; excluidos: PedidoSeleccionado[] } {
  const maxWeight = vehiculo.capacity_weight * SAFETY_MARGIN;
  const maxVolume = vehiculo.capacity_volume * SAFETY_MARGIN;

  const ordenados = [...pedidos].sort((a, b) => cargaRelativa(b, vehiculo) - cargaRelativa(a, vehiculo));

  const incluidos: PedidoSeleccionado[] = [];
  const excluidos: PedidoSeleccionado[] = [];
  let peso = 0;
  let volumen = 0;

  for (const pedido of ordenados) {
    const pesoNuevo = peso + (pedido.total_weight || 0);
    const volumenNuevo = volumen + (pedido.total_volume || 0);
    if (pesoNuevo <= maxWeight && volumenNuevo <= maxVolume) {
      incluidos.push(pedido);
      peso = pesoNuevo;
      volumen = volumenNuevo;
    } else {
      excluidos.push(pedido);
    }
  }

  return { incluidos, excluidos };
}

export function optimizarConCapacidad(
  pedidos: PedidoSeleccionado[],
  vehiculo?: Vehiculo,
): { orden: PedidoSeleccionado[]; excluidosCount: number } {
  if (!vehiculo) return { orden: withStopNumbers(optimizarParadas(pedidos)), excluidosCount: 0 };

  const { incluidos, excluidos } = seleccionarPorCapacidad(pedidos, vehiculo);
  return { orden: withStopNumbers(optimizarParadas(incluidos)), excluidosCount: excluidos.length };
}
