import { FALLBACK_RUTAS } from './fallback-rutas';
import { FALLBACK_CONDUCTORES, FALLBACK_TRANSPORTISTAS, FALLBACK_VEHICULOS } from './fallback-catalogos';
import { fetchConductores, fetchRutas, fetchTransportistas, fetchVehiculos } from './eflow-api';
import type { Conductor, RutaTipo, Transportista, Vehiculo } from './types';

export interface Catalogos {
  rutas: RutaTipo[];
  vehiculos: Vehiculo[];
  transportistas: Transportista[];
  conductores: Conductor[];
}

// Real QA catalogs via the read-only EFLOW API (`server/`). Each list falls
// back independently to its curated mock snapshot if /api is unreachable.
export async function fetchCatalogos(): Promise<Catalogos> {
  const [rutas, vehiculos, transportistas, conductores] = await Promise.all([
    fetchRutas(FALLBACK_RUTAS),
    fetchVehiculos(FALLBACK_VEHICULOS),
    fetchTransportistas(FALLBACK_TRANSPORTISTAS),
    fetchConductores(FALLBACK_CONDUCTORES),
  ]);
  return { rutas, vehiculos, transportistas, conductores };
}
