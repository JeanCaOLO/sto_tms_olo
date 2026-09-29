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

  // Vecino más cercano deja una ruta "usable" pero no óptima; 2-opt la mejora
  // (~10-15% típico). Pedidos con dirección de excepción sin geocodificar quedan
  // fuera del cálculo (Reunión 2026-08-18) — se listan al final, no se descartan.
  return [...dosOpt(resultado, distancia), ...sinCoords];
}

// Mejora local 2-opt sobre una ruta ABIERTA (sin volver al depósito): mientras
// encuentre un cruce, invierte el segmento entre dos aristas si acorta la ruta.
// Estándar práctico junto al vecino más cercano (Croes 1958; ver LKH para el
// tope de calidad). O(n²) por pasada, acotado — suficiente para ≤50 paradas.
function dosOpt(ruta: Pedido[], distancia: (a: Pedido, b: Pedido) => number): Pedido[] {
  const n = ruta.length;
  if (n < 4) return ruta;
  let best = ruta;
  let mejora = true;
  for (let pasada = 0; mejora && pasada < 30; pasada++) {
    mejora = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i; j < n - 1; j++) {
        const antes = distancia(best[i - 1], best[i]) + distancia(best[j], best[j + 1]);
        const despues = distancia(best[i - 1], best[j]) + distancia(best[i], best[j + 1]);
        if (despues + 1e-9 < antes) {
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          mejora = true;
        }
      }
    }
  }
  return best;
}
