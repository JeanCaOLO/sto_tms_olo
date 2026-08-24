import { OSRM_BASE_URL } from './osrm-config';

const OSRM_ROUTE_TIMEOUT_MS = 5000;

interface ParadaConCoords {
  delivery_latitude: number;
  delivery_longitude: number;
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
