// Transportistas terceros — alimenta el selector de transportista del Probador y de Costos.
//
// Lee el catálogo del TMS (`carriers` con `is_flota_propia = false`), con su perfil de cálculo:
//   - `id`        = `carriers.id`: es el valor de la variable `carrierId` en las reglas.
//   - `party_id`  = perfil de cálculo, o null si todavía no tiene.

import { db, type Row } from '../data';

export async function listSimulatedCarriers(_organizationId: string): Promise<Row[]> {
  const [carriers, profiles] = await Promise.all([
    db().find('carrier', {
      where: [{ column: 'is_flota_propia', op: 'eq', value: false }],
      orderBy: [{ column: 'name', locale: true }],
    }),
    db().find('settlementParty'),
  ]);
  const perfil = new Map(profiles.map((p) => [String(p.carrier_id), p]));
  return carriers
    .filter((c) => c.status !== 'inactive')
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      country_id: c.country_id,
      party_id: perfil.get(String(c.id))?.id ?? null,
    }));
}
