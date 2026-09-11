import { haversineKm } from '../../lib/routePlanning/haversine';
import { OSRM_BASE_URL } from './osrm-config';
import type { Pedido } from './types';

// Factor de rodeo calle-real sobre línea recta, usado solo en el fallback
// haversine (sin llamada a red). Ver Reunión 2026-08-18 (plan de matriz N×N).
const DETOUR_FACTOR = 1.35;
const OSRM_TIMEOUT_MS = 5000;

export interface MatrizDistancias {
  distanciaKm(idA: string, idB: string): number | undefined;
  duracionMin(idA: string, idB: string): number | undefined;
  faltantes: number;
  fuente: 'osrm' | 'haversine';
}

// ponytail: haversine duration estimated at 30 km/h average urban speed.
// Ceiling: ignores traffic, road type. Upgrade: always prefer OSRM durations.
const ASSUMED_SPEED_KMH = 30;

function matrizHaversine(pedidos: Pedido[], conCoords: Pedido[]): MatrizDistancias {
  const tablaKm = new Map<string, number>();
  const tablaMin = new Map<string, number>();
  for (const a of conCoords) {
    for (const b of conCoords) {
      if (a.id === b.id) continue;
      const key = `${a.id}|${b.id}`;
      if (tablaKm.has(key)) continue;
      const km = haversineKm(
        { id: a.id, lat: a.delivery_latitude!, lng: a.delivery_longitude!, weightKg: 0, volumeM3: 0 },
        { id: b.id, lat: b.delivery_latitude!, lng: b.delivery_longitude!, weightKg: 0, volumeM3: 0 },
      ) * DETOUR_FACTOR;
      tablaKm.set(key, km);
      tablaMin.set(key, (km / ASSUMED_SPEED_KMH) * 60);
    }
  }
  return {
    distanciaKm: (idA, idB) => tablaKm.get(`${idA}|${idB}`),
    duracionMin: (idA, idB) => tablaMin.get(`${idA}|${idB}`),
    faltantes: pedidos.length - conCoords.length,
    fuente: 'haversine',
  };
}

// Pide la matriz N×N completa en una sola llamada al servicio /table de
// OSRM (distancia real por calle, no línea recta) en vez de una llamada por
// par — así es viable para los ≤50 paradas por viaje que maneja el módulo.
async function matrizOsrm(conCoords: Pedido[]): Promise<{ km: Map<string, number>; min: Map<string, number> } | null> {
  const coords = conCoords.map((p) => `${p.delivery_longitude},${p.delivery_latitude}`).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(`${OSRM_BASE_URL}/table/v1/driving/${coords}?annotations=distance,duration`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !Array.isArray(data.distances) || !Array.isArray(data.durations)) return null;

    const km = new Map<string, number>();
    const min = new Map<string, number>();
    conCoords.forEach((a, i) => {
      conCoords.forEach((b, j) => {
        if (i === j) return;
        const metros = data.distances[i]?.[j];
        const segundos = data.durations[i]?.[j];
        if (typeof metros === 'number') km.set(`${a.id}|${b.id}`, metros / 1000);
        if (typeof segundos === 'number') min.set(`${a.id}|${b.id}`, segundos / 60);
      });
    });
    return { km, min };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Precalcula la distancia entre cada par de pedidos con coordenadas una
// sola vez; el optimizador de paradas después solo hace lookups O(1) en vez
// de recalcular distancia en cada comparación del nearest-neighbor. Intenta
// OSRM (distancia real de manejo, gratis) primero; si falla o no hay red,
// cae a haversine sin que el usuario tenga que hacer nada.
export async function construirMatrizDistancias(pedidos: Pedido[]): Promise<MatrizDistancias> {
  const conCoords = pedidos.filter((p) => p.delivery_latitude != null && p.delivery_longitude != null);
  const faltantes = pedidos.length - conCoords.length;

  if (conCoords.length >= 2) {
    const osrm = await matrizOsrm(conCoords);
    if (osrm) {
      return {
        distanciaKm: (idA, idB) => osrm.km.get(`${idA}|${idB}`),
        duracionMin: (idA, idB) => osrm.min.get(`${idA}|${idB}`),
        faltantes,
        fuente: 'osrm',
      };
    }
  }

  return matrizHaversine(pedidos, conCoords);
}
