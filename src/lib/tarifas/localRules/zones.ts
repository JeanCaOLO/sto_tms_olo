// Zonas y grupos de zona.

import { db, type Row } from '../data';
import { zoneUsedByRateTables } from '../rateTablesDataSource';

type SaveResult = { error: { code?: string; message: string } | null };

const OK: SaveResult = { error: null };

/**
 * Grupos de zona — propios del cálculo. Cada grupo guarda los CÓDIGOS de las zonas del catálogo
 * que abarca (`zone_codes`).
 */
export async function listZoneGroups(_organizationId: string): Promise<Row[]> {
  const rows = await db().find('zoneGroup', { orderBy: [{ column: 'name', locale: true }] });
  return rows.map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    country_id: g.country_id,
    zone_codes: Array.isArray(g.zone_codes) ? g.zone_codes : [],
    status: g.status,
  }));
}

/**
 * Valida que una zona no quede en dos grupos del mismo país: el motor tomaría uno arbitrario y la
 * regla por grupo cobraría según el orden en que se cargaron.
 */
export async function saveZoneGroup(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  const codes: string[] = Array.isArray(payload.zone_codes) ? payload.zone_codes.map(String) : [];
  const otros = (await db().find('zoneGroup', {
    where: [{ column: 'country_id', op: 'eq', value: payload.country_id }],
  })).filter((g) => g.id !== id);

  for (const code of codes) {
    const dueño = otros.find((g) => (Array.isArray(g.zone_codes) ? g.zone_codes : []).map(String).includes(code));
    if (dueño) {
      return { error: { code: '23505', message: `La zona "${code}" ya está en el grupo "${dueño.name}".` } };
    }
  }

  try {
    const toSave = { ...payload, zone_codes: codes };
    if (id) {
      await db().update('zoneGroup', id, toSave);
    } else {
      await db().insert('zoneGroup', { ...toSave, status: 'active' });
    }
    return OK;
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export async function deleteZoneGroup(id: string): Promise<SaveResult> {
  try {
    await db().delete('zoneGroup', id);
    return OK;
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

/**
 * Zonas del catálogo con su grupo (resuelto desde `zone_codes`) y su país. Misma forma de fila que
 * antes (`zone_groups.name`, `countries.name`) para las pantallas que la muestran.
 */
export async function listZones(_organizationId: string): Promise<Row[]> {
  const [zones, zoneGroups, countries] = await Promise.all([
    db().find('zone', { orderBy: [{ column: 'code', locale: true }] }),
    db().find('zoneGroup'),
    db().find('country'),
  ]);

  const countriesById = new Map(countries.map((c) => [c.id, c]));
  const grupoDe = (z: Row) => zoneGroups.find(
    (g) => g.country_id === z.country_id && (Array.isArray(g.zone_codes) ? g.zone_codes : []).map(String).includes(String(z.code)),
  );

  return zones.map((z) => {
    const grupo = grupoDe(z);
    return {
      ...z,
      zone_group_id: grupo?.id ?? null,
      zone_groups: grupo ? { name: grupo.name } : null,
      countries: z.country_id ? { name: countriesById.get(z.country_id)?.name ?? null } : null,
    };
  });
}

/**
 * Filas de tarifario que nombran el código de una zona. Las zonas son del catálogo y se dan de baja
 * allá; esto sirve para avisar en la pantalla de tarifarios que una fila apunta a una zona que ya
 * no existe o está inactiva.
 */
export async function zoneUsage(code: string) {
  return zoneUsedByRateTables(code);
}
