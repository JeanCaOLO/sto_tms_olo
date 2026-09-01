import { supabase } from '../../lib/supabase';
import type { AppUser } from '../../lib/mock-auth';
import { FALLBACK_RUTAS } from './fallback-rutas';
import { FALLBACK_CONDUCTORES, FALLBACK_TRANSPORTISTAS, FALLBACK_VEHICULOS } from './fallback-catalogos';
import type { Conductor, RutaTipo, Transportista, Vehiculo } from './types';

export interface Catalogos {
  rutas: RutaTipo[];
  vehiculos: Vehiculo[];
  transportistas: Transportista[];
  conductores: Conductor[];
}

export async function fetchCatalogos(appUser: AppUser): Promise<Catalogos> {
  const [rutasRes, vehiculosRes, transportistasRes, conductoresRes] = await Promise.all([
    supabase.from('route_types').select('id, name').eq('status', 'active').order('name'),
    supabase.from('vehicles').select('*').eq('status', 'active').eq('organization_id', appUser.organization_id).order('plate'),
    supabase.from('carriers').select('id, name').eq('status', 'active').eq('organization_id', appUser.organization_id).order('name'),
    supabase.from('drivers').select('id, full_name, document, carrier_id').eq('status', 'active').eq('organization_id', appUser.organization_id).order('full_name'),
  ]);

  return {
    rutas: rutasRes.data?.length ? rutasRes.data : FALLBACK_RUTAS,
    vehiculos: vehiculosRes.data?.length ? vehiculosRes.data : FALLBACK_VEHICULOS,
    transportistas: transportistasRes.data?.length ? transportistasRes.data : FALLBACK_TRANSPORTISTAS,
    conductores: conductoresRes.data?.length ? conductoresRes.data : FALLBACK_CONDUCTORES,
  };
}
