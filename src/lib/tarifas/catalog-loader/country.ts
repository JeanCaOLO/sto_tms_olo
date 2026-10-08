// Carga de país y su configuración de cálculo.

import { db, type Row } from '../data';
import { toDecimal } from '../money';
import type { Country, RoundingMode } from '../types';

const eq = (column: string, value: unknown) => ({ column, op: 'eq' as const, value });

/**
 * País del catálogo + su configuración de cálculo. Sin configuración no hay país liquidable: los
 * decimales y el modo de redondeo cambian el total, y adivinarlos daría un número plausible y mal
 * redondeado.
 */
function toCountry(row: Row, settings: Row | undefined): Country | null {
  if (!settings) return null;
  return {
    id: row.id,
    iso2: row.code,
    name: row.name,
    localCurrency: row.currency,
    roundingDecimals: Number(settings.rounding_decimals),
    roundingMode: settings.rounding_mode as RoundingMode,
    overnightThresholdHours: Number(settings.overnight_threshold_hours),
  };
}

export async function loadCountry(countryId: string): Promise<Country | null> {
  const [row, settings] = await Promise.all([
    db().findOne('country', countryId),
    db().find('countrySettings', { where: [eq('country_id', countryId)], limit: 1 }),
  ]);
  return row ? toCountry(row, settings[0]) : null;
}

/** Países del catálogo que tienen configuración de cálculo (los liquidables). */
export async function loadCountries(): Promise<Country[]> {
  const [rows, settings] = await Promise.all([
    db().find('country', { orderBy: [{ column: 'name', locale: true }] }),
    db().find('countrySettings'),
  ]);
  const byCountry = new Map(settings.map((s) => [s.country_id, s]));
  return rows
    .map((row) => toCountry(row, byCountry.get(row.id)))
    .filter((c): c is Country => c !== null);
}
