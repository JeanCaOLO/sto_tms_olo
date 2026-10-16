// Países y su configuración de cálculo (redondeo, pernocta).

import { db, type Row } from '../data';

type SaveResult = { error: { code?: string; message: string } | null };

const OK: SaveResult = { error: null };

/**
 * Países del catálogo, con su configuración de cálculo aplanada en la fila. Conserva los nombres de
 * columna que ya usaban las pantallas (`iso2`, `local_currency`, `rounding_*`,
 * `overnight_threshold_hours`); `settings_id` es nulo si el país todavía no se configuró.
 */
export async function listCountries(_organizationId: string): Promise<Row[]> {
  const [countries, settings] = await Promise.all([
    db().find('country', { orderBy: [{ column: 'name', locale: true }] }),
    db().find('countrySettings'),
  ]);
  const byCountry = new Map(settings.map((s) => [s.country_id, s]));
  return countries.map((c) => {
    const s = byCountry.get(c.id);
    return {
      id: c.id,
      code: c.code,
      iso2: c.code,
      name: c.name,
      local_currency: c.currency,
      settings_id: s?.id ?? null,
      rounding_decimals: s?.rounding_decimals ?? null,
      rounding_mode: s?.rounding_mode ?? null,
      overnight_threshold_hours: s?.overnight_threshold_hours ?? null,
    };
  });
}

/** Guarda la configuración de cálculo de un país (redondeo, pernocta). La moneda es del catálogo. */
export async function saveCountrySettings(
  countryId: string,
  payload: { rounding_decimals: number; rounding_mode: string; overnight_threshold_hours: number },
): Promise<SaveResult> {
  try {
    const [actual] = await db().find('countrySettings', {
      where: [{ column: 'country_id', op: 'eq', value: countryId }],
      limit: 1,
    });
    if (actual) {
      await db().update('countrySettings', actual.id, payload);
    } else {
      await db().insert('countrySettings', { ...payload, country_id: countryId });
    }
    return OK;
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
