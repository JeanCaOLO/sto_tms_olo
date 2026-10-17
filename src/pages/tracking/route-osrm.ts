// Ruta por calles del viaje (sede → paradas en secuencia) con OSRM, partida por tramo para pintar lo recorrido y
// lo pendiente. Misma base que Planificación (VITE_OSRM_URL, ver planificacion/osrm-config.ts). SIN línea recta
// de respaldo: si OSRM no responde no se dibuja ruta (el mapa queda con las paradas destacadas).
// Se pide UNA vez por viaje y paradas (caché en memoria), no en cada refresco.
import { OSRM_BASE_URL } from '../planificacion/osrm-config';

const TIMEOUT_MS = 6000;
const MAX_CACHE = 50;

/** Tramo i: del punto i al i+1 de [sede, ...paradas]; coords [lat, lng]. */
export type Tramo = [number, number][];

const cache = new Map<string, Promise<Tramo[]>>();

async function pedir(puntos: [number, number][]): Promise<Tramo[]> {
  const coords = puntos.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=false&geometries=geojson&steps=true`, { signal: controller.signal });
    if (!res.ok) return [];
    const legs = (await res.json())?.routes?.[0]?.legs;
    if (!Array.isArray(legs) || legs.length !== puntos.length - 1) return [];
    return legs.map((leg: { steps?: { geometry?: { coordinates?: [number, number][] } }[] }) =>
      (leg.steps ?? []).flatMap((step) => (step.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as [number, number])));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Tramos por calles para los puntos dados (≥ 2). Un fallo no se cachea, para reintentar en otra apertura. */
export function rutaPorCalles(puntos: [number, number][]): Promise<Tramo[]> {
  if (puntos.length < 2) return Promise.resolve([]);
  const key = puntos.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(';');
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = pedir(puntos).then((tramos) => {
    if (!tramos.length) cache.delete(key);
    return tramos;
  });
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, pending);
  return pending;
}
