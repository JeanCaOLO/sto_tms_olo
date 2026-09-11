import type { MatrizDistancias } from './distance-matrix';
import type { Pedido, PedidoSeleccionado } from './types';

export const withStopNumbers = (pedidos: Pedido[]): PedidoSeleccionado[] =>
  pedidos.map((p, i) => ({ ...p, stop_number: i + 1 }));

const porZona = (a: Pedido, b: Pedido) =>
  ((a.delivery_zone || '') + (a.delivery_city || '')).localeCompare((b.delivery_zone || '') + (b.delivery_city || ''));

// Algoritmo de vecino más cercano para optimizar paradas. `matriz` (N×N
// precalculada, ver distance-matrix.ts) se usa cuando está disponible; si un
// par no está en la matriz (fallback euclidiano en grados, sin km reales).
export function optimizarParadas(pedidos: Pedido[], matriz?: MatrizDistancias): Pedido[] {
  if (pedidos.length <= 1) return pedidos;

  const conCoords = pedidos.filter((p) => p.delivery_latitude != null && p.delivery_longitude != null);
  const sinCoords = pedidos.filter((p) => p.delivery_latitude == null || p.delivery_longitude == null);

  // Si no hay coordenadas suficientes, ordenar todo por zona/ciudad.
  if (conCoords.length < 2) {
    return [...pedidos].sort(porZona);
  }

  const distancia = (a: Pedido, b: Pedido): number => {
    const porMatriz = matriz?.distanciaKm(a.id, b.id);
    if (porMatriz != null) return porMatriz;
    const lat1 = a.delivery_latitude!, lng1 = a.delivery_longitude!;
    const lat2 = b.delivery_latitude!, lng2 = b.delivery_longitude!;
    return Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);
  };

  const visitados = new Set<string>();
  const resultado: Pedido[] = [];
  let actual = conCoords[0];
  visitados.add(actual.id);
  resultado.push(actual);

  while (resultado.length < conCoords.length) {
    let minDist = Infinity;
    let siguiente: Pedido | null = null;
    for (const p of conCoords) {
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

  // Pedidos con dirección de excepción sin geocodificar quedan fuera del
  // cálculo de ruta óptima (Reunión 2026-08-18) — se listan al final, no se
  // descartan.
  return [...resultado, ...sinCoords];
}
