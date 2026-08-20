import { haversineKm } from '../../lib/routePlanning/haversine';
import type { Pedido } from './types';

// Factor de rodeo calle-real sobre línea recta, para aproximar distancia de
// manejo sin llamar a Google Maps por cada par — estos son pedidos
// sintéticos, no direcciones reales que ameriten gastar cuota de API. Ver
// Reunión 2026-08-18 (plan de matriz N×N) y src/lib/routePlanning/ para la
// versión que sí llama a Google Maps con direcciones reales.
const DETOUR_FACTOR = 1.35;

export interface MatrizDistancias {
  distanciaKm(idA: string, idB: string): number | undefined;
  faltantes: number;
}

// Precalcula la distancia entre cada par de pedidos con coordenadas una
// sola vez; el optimizador de paradas después solo hace lookups O(1) en
// vez de recalcular distancia en cada comparación del nearest-neighbor.
export function construirMatrizDistancias(pedidos: Pedido[]): MatrizDistancias {
  const conCoords = pedidos.filter((p) => p.delivery_latitude != null && p.delivery_longitude != null);
  const tabla = new Map<string, number>();

  for (const a of conCoords) {
    for (const b of conCoords) {
      if (a.id === b.id) continue;
      const key = `${a.id}|${b.id}`;
      if (tabla.has(key)) continue;
      const km = haversineKm(
        { id: a.id, lat: a.delivery_latitude!, lng: a.delivery_longitude!, weightKg: 0, volumeM3: 0 },
        { id: b.id, lat: b.delivery_latitude!, lng: b.delivery_longitude!, weightKg: 0, volumeM3: 0 },
      ) * DETOUR_FACTOR;
      tabla.set(key, km);
    }
  }

  return {
    distanciaKm: (idA, idB) => tabla.get(`${idA}|${idB}`),
    faltantes: pedidos.length - conCoords.length,
  };
}
