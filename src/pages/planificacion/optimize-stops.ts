import type { Pedido, PedidoSeleccionado } from './types';

export const withStopNumbers = (pedidos: Pedido[]): PedidoSeleccionado[] =>
  pedidos.map((p, i) => ({ ...p, stop_number: i + 1 }));

// Algoritmo de vecino más cercano para optimizar paradas
export function optimizarParadas(pedidos: Pedido[]): Pedido[] {
  if (pedidos.length <= 1) return pedidos;

  const conCoords = pedidos.filter(
    (p) => p.delivery_latitude != null && p.delivery_longitude != null
  );

  // Si no hay coordenadas, ordenar por zona/ciudad
  if (conCoords.length < 2) {
    return [...pedidos].sort((a, b) => {
      const zonaA = (a.delivery_zone || '') + (a.delivery_city || '');
      const zonaB = (b.delivery_zone || '') + (b.delivery_city || '');
      return zonaA.localeCompare(zonaB);
    });
  }

  // Nearest-neighbor greedy
  const distancia = (a: Pedido, b: Pedido): number => {
    const lat1 = a.delivery_latitude!;
    const lng1 = a.delivery_longitude!;
    const lat2 = b.delivery_latitude!;
    const lng2 = b.delivery_longitude!;
    return Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);
  };

  const visitados = new Set<string>();
  const resultado: Pedido[] = [];
  let actual = pedidos[0];
  visitados.add(actual.id);
  resultado.push(actual);

  while (resultado.length < pedidos.length) {
    let minDist = Infinity;
    let siguiente: Pedido | null = null;
    for (const p of pedidos) {
      if (visitados.has(p.id)) continue;
      const d = distancia(actual, p);
      if (d < minDist) {
        minDist = d;
        siguiente = p;
      }
    }
    if (!siguiente) break;
    visitados.add(siguiente.id);
    resultado.push(siguiente);
    actual = siguiente;
  }

  return resultado;
}
