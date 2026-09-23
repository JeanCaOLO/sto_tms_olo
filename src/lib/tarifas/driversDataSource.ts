// Conductores del tarifador: alta, baja y consulta.
//
// Por qué el módulo tiene los suyos: la guía física trae NOMBRE y CÉDULA, y `driverSearch.ts` sabe
// buscar por cualquiera de los dos desde hace tiempo — pero la lista se leía del TMS, así que sin
// conductores cargados allá no había nada que buscar acá.
//
// `toDriverOptions` arma exactamente la forma que ese buscador ya consume, así que el módulo puro
// no se toca ni se vuelve a probar: sigue recibiendo la misma entrada.

import { db, type Row } from './data';
import { normalizeDocument } from './driverSearch';
import type { DriverOption } from './driverSearch';
import type { DriverDef } from './types';

export interface DriverInput {
  countryId: string;
  partyId: string;
  fullName: string;
  document: string | null;
  phone: string | null;
  license: string | null;
  licenseExpiresAt: string | null;
  notes: string | null;
  active: boolean;
}

export type DriverErrors = Partial<Record<keyof DriverInput, string>>;

export type SaveDriverResult =
  | { status: 'saved'; driver: DriverDef }
  | { status: 'invalid'; errors: DriverErrors }
  | { status: 'failed'; error: { message: string } };

function toDomain(row: Row): DriverDef {
  return {
    id: row.id,
    countryId: row.country_id,
    partyId: row.party_id,
    fullName: row.full_name,
    document: row.document ?? null,
    phone: row.phone ?? null,
    license: row.license ?? null,
    licenseExpiresAt: row.license_expires_at ?? null,
    notes: row.notes ?? null,
    active: !!row.active,
  };
}

export async function listDrivers(
  partyId: string,
  options?: { includeInactive?: boolean },
): Promise<DriverDef[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [
    { column: 'party_id', op: 'eq', value: partyId },
  ];
  if (!options?.includeInactive) where.push({ column: 'active', op: 'eq', value: true });

  const rows = await db().find('driver', { where, orderBy: [{ column: 'full_name', locale: true }] });
  return rows.map(toDomain);
}

export async function listDriversByCountry(
  countryId: string,
  options?: { includeInactive?: boolean },
): Promise<DriverDef[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [
    { column: 'country_id', op: 'eq', value: countryId },
  ];
  if (!options?.includeInactive) where.push({ column: 'active', op: 'eq', value: true });

  const rows = await db().find('driver', { where, orderBy: [{ column: 'full_name', locale: true }] });
  return rows.map(toDomain);
}

export async function getDriver(id: string): Promise<DriverDef | null> {
  const row = await db().findOne('driver', id);
  return row ? toDomain(row) : null;
}

/**
 * Adapta al contrato que `driverSearch.ts` ya consume, resolviendo el nombre de la compañía en
 * memoria. PURA, para poder probarla sin base.
 */
export function toDriverOptions(
  drivers: DriverDef[],
  parties: { id: string; name: string }[],
): DriverOption[] {
  const nombreDe = new Map(parties.map((p) => [p.id, p.name]));
  return drivers.map((d) => ({
    id: d.id,
    fullName: d.fullName,
    document: d.document,
    carrierId: d.partyId,
    carrierName: nombreDe.get(d.partyId) ?? null,
  }));
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function validateDriver(
  input: DriverInput,
  existing: Pick<DriverDef, 'id' | 'document' | 'partyId'>[],
  id?: string,
): DriverErrors {
  const errors: DriverErrors = {};

  if (!input.fullName.trim()) errors.fullName = 'El nombre es obligatorio.';

  const doc = normalizeDocument(input.document);
  if (doc) {
    // Se compara NORMALIZADO: "1-2345-6789" y "123456789" son la misma persona, y permitir las dos
    // formas crearía dos conductores que el buscador muestra como duplicados idénticos.
    const repetida = existing.some(
      (d) => d.id !== id && d.partyId === input.partyId && normalizeDocument(d.document) === doc,
    );
    if (repetida) errors.document = 'Esta compañía ya tiene un conductor con esa cédula.';
  }

  const vence = (input.licenseExpiresAt ?? '').trim();
  if (vence && !DATE_ONLY.test(vence)) {
    errors.licenseExpiresAt = 'Fecha inválida: se espera AAAA-MM-DD.';
  }

  return errors;
}

export async function saveDriver(input: DriverInput, id?: string): Promise<SaveDriverResult> {
  const existing = (await db().find('driver')).map(toDomain);
  const errors = validateDriver(input, existing, id);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const values: Row = {
    country_id: input.countryId,
    party_id: input.partyId,
    full_name: input.fullName.trim(),
    document: input.document?.trim() || null,
    phone: input.phone?.trim() || null,
    license: input.license?.trim() || null,
    license_expires_at: input.licenseExpiresAt?.trim() || null,
    notes: input.notes?.trim() || null,
    active: input.active,
  };

  try {
    const saved = id
      ? await db().update('driver', id, values)
      : await db().insert('driver', values);
    return { status: 'saved', driver: toDomain(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** Baja LÓGICA: hay liquidaciones emitidas que nombran al conductor. */
export async function setDriverActive(id: string, active: boolean): Promise<{ error: string | null }> {
  try {
    await db().update('driver', id, { active });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteDriver(id: string): Promise<{ error: string | null }> {
  try {
    await db().delete('driver', id);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
