import { OSRM_BASE_URL } from './osrm-config';

const OSRM_ROUTE_TIMEOUT_MS = 5000;

interface ParadaConCoords {
  delivery_latitude: number;
  delivery_longitude: number;
}

interface ParadaConNumero extends ParadaConCoords {
  stop_number: number;
}

export interface Leg {
  coords: [number, number][];
  fromStopNumber: number;
  toStopNumber: number;
}

// Como obtenerGeometriaRuta, pero devuelve la geometría partida por tramo
// (leg) — un Leg por par de paradas consecutivas — para que el mapa pueda
// pintar cada tramo con su propio estilo (BR1.3: tramo "de recolección" si un
// extremo es devolución). Usa OSRM con steps=true y concatena la geometría de
// los steps de cada leg. Fallback (red/OSRM caído/timeout): un segmento recto
// por par consecutivo, misma robustez que obtenerGeometriaRuta.
export async function obtenerGeometriaRutaPorLeg(paradas: ParadaConNumero[]): Promise<Leg[]> {
  const rectos: Leg[] = [];
  for (let i = 0; i < paradas.length - 1; i++) {
    rectos.push({
      coords: [
        [paradas[i].delivery_latitude, paradas[i].delivery_longitude],
        [paradas[i + 1].delivery_latitude, paradas[i + 1].delivery_longitude],
      ],
      fromStopNumber: paradas[i].stop_number,
      toStopNumber: paradas[i + 1].stop_number,
    });
  }
  if (paradas.length < 2) return rectos;

  const coords = paradas.map((p) => `${p.delivery_longitude},${p.delivery_latitude}`).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_ROUTE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
      { signal: controller.signal },
    );
    if (!res.ok) return rectos;
    const data = await res.json();
    const legs = data?.routes?.[0]?.legs;
    if (!Array.isArray(legs) || legs.length !== rectos.length) return rectos;
    return legs.map((leg: any, i: number) => {
      const puntos: [number, number][] = [];
      for (const step of leg?.steps || []) {
        const stepCoords = step?.geometry?.coordinates;
        if (!Array.isArray(stepCoords)) continue;
        for (const [lng, lat] of stepCoords) puntos.push([lat, lng]);
      }
      return puntos.length >= 2
        ? { ...rectos[i], coords: puntos }
        : rectos[i];
    });
  } catch {
    return rectos;
  } finally {
    clearTimeout(timeout);
  }
}

// Pide a OSRM la geometría real por calles (servicio /route, no /table —
// ese lo usa distance-matrix.ts para distancias, no para dibujar). Cae a
// línea recta entre paradas consecutivas si falla la red/OSRM/timeout,
// mismo patrón de robustez que construirMatrizDistancias.
export async function obtenerGeometriaRuta(paradas: ParadaConCoords[]): Promise<[number, number][]> {
  const lineaRecta = paradas.map((p) => [p.delivery_latitude, p.delivery_longitude] as [number, number]);
  if (paradas.length < 2) return lineaRecta;

  const coords = paradas.map((p) => `${p.delivery_longitude},${p.delivery_latitude}`).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_ROUTE_TIMEOUT_MS);
  try {
    const res = await fetch(`${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
      signal: controller.signal,
    });
    if (!res.ok) return lineaRecta;
    const data = await res.json();
    const coordsGeo = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordsGeo)) return lineaRecta;
    return coordsGeo.map(([lng, lat]: [number, number]) => [lat, lng]);
  } catch {
    return lineaRecta;
  } finally {
    clearTimeout(timeout);
  }
}
