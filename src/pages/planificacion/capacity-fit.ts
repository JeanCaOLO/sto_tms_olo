import { optimizarParadas, withStopNumbers } from './optimize-stops';
import { calcularEtas } from './time-windows';
import type { MatrizDistancias } from './distance-matrix';
import type { PedidoSeleccionado, Vehiculo } from './types';

// Weight is a legal/safety constraint (Costa Rica: Decreto N.º 31363-MOPT sets
// hard GVWR maximums; fleet-management guidance converges on 80-85% of rated
// payload as the practical ceiling, to absorb uneven load distribution and
// weight transfer under braking/cornering). Volume ("cube out") has no safety
// dimension, just packing geometry, so it gets a tighter margin. See
// docs/decisions/0001-route-planning-safety-margin-and-optimization.md.
const WEIGHT_SAFETY_MARGIN = 0.85;
const VOLUME_SAFETY_MARGIN = 0.95;

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
// needs to be exact later.
//
// `anclados`: order IDs the user explicitly wants in this trip no matter
// what — they're seated first (even if that alone blows the budget, so the
// UI can warn), then the rest of the capacity is filled largest-first from
// the remaining orders.
export function seleccionarPorCapacidad(
  pedidos: PedidoSeleccionado[],
  vehiculo: Vehiculo,
  anclados: Set<string> = new Set(),
): { incluidos: PedidoSeleccionado[]; excluidos: PedidoSeleccionado[] } {
  const maxWeight = vehiculo.capacity_weight * WEIGHT_SAFETY_MARGIN;
  const maxVolume = vehiculo.capacity_volume * VOLUME_SAFETY_MARGIN;

  const fijos = pedidos.filter((p) => anclados.has(p.id));
  const resto = pedidos.filter((p) => !anclados.has(p.id));

  const incluidos: PedidoSeleccionado[] = [...fijos];
  const excluidos: PedidoSeleccionado[] = [];
  let peso = fijos.reduce((s, p) => s + (p.total_weight || 0), 0);
  let volumen = fijos.reduce((s, p) => s + (p.total_volume || 0), 0);

  const ordenados = [...resto].sort((a, b) => cargaRelativa(b, vehiculo) - cargaRelativa(a, vehiculo));

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

// Would anchoring `pedidoNuevo` push the already-anchored total (plus this
// order) over the safety-margin capacity? Used to block the pin action
// itself, before the user even hits "Optimizar paradas".
export function excedeCapacidadAlAnclar(
  pedidoNuevo: PedidoSeleccionado,
  anclados: Set<string>,
  pedidos: PedidoSeleccionado[],
  vehiculo: Vehiculo,
): boolean {
  const maxWeight = vehiculo.capacity_weight * WEIGHT_SAFETY_MARGIN;
  const maxVolume = vehiculo.capacity_volume * VOLUME_SAFETY_MARGIN;
  const fijos = pedidos.filter((p) => anclados.has(p.id));
  const peso = fijos.reduce((s, p) => s + (p.total_weight || 0), 0) + (pedidoNuevo.total_weight || 0);
  const volumen = fijos.reduce((s, p) => s + (p.total_volume || 0), 0) + (pedidoNuevo.total_volume || 0);
  return peso > maxWeight || volumen > maxVolume;
}

export function optimizarConCapacidad(
  pedidos: PedidoSeleccionado[],
  vehiculo?: Vehiculo,
  anclados?: Set<string>,
  matriz?: MatrizDistancias,
): { orden: PedidoSeleccionado[]; excluidosCount: number } {
  if (!vehiculo) {
    const orden = withStopNumbers(optimizarParadas(pedidos, matriz));
    return { orden: matriz ? calcularEtas(orden, matriz) : orden, excluidosCount: 0 };
  }

  const { incluidos, excluidos } = seleccionarPorCapacidad(pedidos, vehiculo, anclados);
  const orden = withStopNumbers(optimizarParadas(incluidos, matriz));
  return { orden: matriz ? calcularEtas(orden, matriz) : orden, excluidosCount: excluidos.length };
}
