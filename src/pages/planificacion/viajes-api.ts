import { fetchViajes } from './eflow-api';
import { getFallbackViajes } from './fallback-viajes';
import type { Viaje } from './types';

// Real QA trips via the read-only EFLOW API (`server/`). Falls back to the
// curated mock viajes if /api is unreachable so the tab still works offline.
export async function fetchViajesDespachados(): Promise<Viaje[]> {
  try {
    const viajes = await fetchViajes();
    return viajes.filter((v) => v.status === 'despachado');
  } catch (err) {
    console.warn('[planificacion] /api/viajes no disponible, usando mock:', (err as Error).message);
    return getFallbackViajes().filter((v) => v.status === 'despachado');
  }
}
