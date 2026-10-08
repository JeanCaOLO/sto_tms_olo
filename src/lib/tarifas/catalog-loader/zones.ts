// Carga de zonas y grupos de zonas.

import { db, type Row } from '../data';
import type { Zone, ZoneGroup } from '../types';

const eq = (column: string, value: unknown) => ({ column, op: 'eq' as const, value });

function toZoneGroup(row: Row): ZoneGroup {
  return {
    id: row.id,
    countryId: row.country_id ?? '',
    code: row.code,
    name: row.name,
    zoneCodes: Array.isArray(row.zone_codes) ? row.zone_codes.map(String) : [],
  };
}

/**
 * Zonas del catálogo, con su grupo resuelto desde `zoneGroup.zone_codes`. Una zona que no está en
 * ningún grupo queda con `zoneGroupId: null`; en dos grupos del mismo país, gana el primero por
 * código (determinista), y eso se considera un error de configuración que la pantalla de grupos
 * debe impedir.
 */
export async function loadZones(countryId?: string): Promise<Zone[]> {
  const [zones, groups] = await Promise.all([
    db().find('zone', {
      ...(countryId ? { where: [eq('country_id', countryId)] } : {}),
      orderBy: [{ column: 'code', locale: true }],
    }),
    loadZoneGroups(countryId),
  ]);
  const ordered = [...groups].sort((a, b) => a.code.localeCompare(b.code));

  return zones
    .filter((z) => z.code)
    .map((row) => ({
      id: row.id,
      countryId: row.country_id ?? '',
      code: String(row.code),
      name: row.name,
      zoneGroupId: ordered.find(
        (g) => g.countryId === row.country_id && (g.zoneCodes ?? []).includes(String(row.code)),
      )?.id ?? null,
    }));
}

export async function loadZoneGroups(countryId?: string): Promise<ZoneGroup[]> {
  const rows = await db().find('zoneGroup', countryId ? { where: [eq('country_id', countryId)] } : undefined);
  return rows.map(toZoneGroup);
}
