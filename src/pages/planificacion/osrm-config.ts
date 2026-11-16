// OSRM (Open Source Routing Machine): distancias y trazos por calles para el mapa de
// Planificación y Tracking.
//
// Orden de preferencia (osrmFetch):
// 1. VITE_OSRM_URL, si está definida (.env.local): un OSRM directo, p. ej. el compose de
//    infra/osrm en desarrollo.
// 2. El OSRM propio del TMS a través del backend (GET /api/v1/planificacion/osrm/...): vive
//    dentro de la VPC y el navegador no lo alcanza directo. Va con el token de la sesión.
//    Tiene los mapas de Costa Rica y Venezuela.
// 3. El demo público (router.project-osrm.org), sin SLA: solo si no hay sesión o el backend
//    no tiene OSRM para esos puntos (503) o no conoce la ruta (404, backend viejo en local).
import { currentAccessToken } from '../../lib/api-client';

const OSRM_DIRECTO = (import.meta.env.VITE_OSRM_URL ?? '').replace(/\/$/, '');
const OSRM_PUBLICO = 'https://router.project-osrm.org';
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

/** Base del OSRM directo (o el público). Se conserva por compatibilidad; usar osrmFetch. */
export const OSRM_BASE_URL = OSRM_DIRECTO || OSRM_PUBLICO;

type Opciones = NonNullable<Parameters<typeof fetch>[1]>;

/** Pide a OSRM `ruta` = 'route|table/v1/driving/<lng,lat;…>[?…]' por el mejor camino disponible. */
export async function osrmFetch(ruta: string, init: Opciones = {}): Promise<Response> {
  if (OSRM_DIRECTO) return fetch(`${OSRM_DIRECTO}/${ruta}`, init);
  const token = currentAccessToken();
  if (token) {
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch(`${API_BASE}/api/v1/planificacion/osrm/${ruta}`, { ...init, headers });
      if (res.status !== 503 && res.status !== 404) return res;
    } catch (err) {
      if (init.signal?.aborted) throw err;
    }
  }
  return fetch(`${OSRM_PUBLICO}/${ruta}`, init);
}
