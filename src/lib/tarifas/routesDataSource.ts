// Rutas comerciales del tarifador: alta, baja y consulta.
//
// Una ruta es la lane de un transportista —`CAR-CCS`, "Carabobo → Caracas Norte"— con todo lo que
// el motor necesita saber del viaje: sus dos zonas, kilómetros, paradas, bultos, peso y peajes.
//
// Lo que resuelve: hasta ahora cada liquidación tecleaba esos siete números a mano, uno por uno, y
// las zonas se elegían de dos desplegables que casi nadie completaba — con el resultado de que las
// reglas por zona no aplicaban nunca. Con la ruta cargada una vez, cada viaje los hereda.
//
// NO lleva importe: la tarifa sale del tarifario de su compañía, con clave (zona origen, zona
// destino). Ver `rateTablesDataSource.ts`.

import { db, type Row } from './data';
import type { RouteDef } from './types';

export interface RouteInput {
  countryId: string;
  partyId: string;
  code: string;
  name: string;
  originZoneId: string;
  destZoneId: string;
  km: string;
  stopCount: string;
  packageCount: string;
  weightKg: string;
  tollCount: string;
  tollsAmount: string;
  durationHours: string;
  notes: string | null;
  active: boolean;
}

export type RouteErrors = Partial<Record<keyof RouteInput, string>>;

export type SaveRouteResult =
  | { status: 'saved'; route: RouteDef }
  | { status: 'invalid'; errors: RouteErrors }
  | { status: 'failed'; error: { message: string } };

function toDomain(row: Row): RouteDef {
  return {
    id: row.id,
    countryId: row.country_id,
    partyId: row.party_id,
    code: row.code,
    name: row.name,
    originZoneId: row.origin_zone_id,
    destZoneId: row.dest_zone_id,
    km: Number(row.km) || 0,
    stopCount: Number(row.stop_count) || 0,
    packageCount: Number(row.package_count) || 0,
    weightKg: Number(row.weight_kg) || 0,
    tollCount: Number(row.toll_count) || 0,
    tollsAmount: String(row.tolls_amount ?? '0'),
    durationHours: Number(row.duration_hours) || 0,
    notes: row.notes ?? null,
    active: !!row.active,
  };
}

export async function listRoutes(
  partyId: string,
  options?: { includeInactive?: boolean },
): Promise<RouteDef[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [
    { column: 'party_id', op: 'eq', value: partyId },
  ];
  if (!options?.includeInactive) where.push({ column: 'active', op: 'eq', value: true });

  const rows = await db().find('route', { where, orderBy: [{ column: 'code', locale: true }] });
  return rows.map(toDomain);
}

export async function listRoutesByCountry(
  countryId: string,
  options?: { includeInactive?: boolean },
): Promise<RouteDef[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [
    { column: 'country_id', op: 'eq', value: countryId },
  ];
  if (!options?.includeInactive) where.push({ column: 'active', op: 'eq', value: true });

  const rows = await db().find('route', { where, orderBy: [{ column: 'code', locale: true }] });
  return rows.map(toDomain);
}

export async function getRoute(id: string): Promise<RouteDef | null> {
  const row = await db().findOne('route', id);
  return row ? toDomain(row) : null;
}

const NON_NEGATIVE = /^\d+(\.\d+)?$/;
const CODE_SHAPE = /^[A-Z0-9_-]+$/;

/** Zona mínima que hace falta conocer para validar una ruta. */
export interface ZoneRef {
  id: string;
  countryId: string;
  code: string;
}

export function validateRoute(
  input: RouteInput,
  existing: Pick<RouteDef, 'id' | 'code' | 'partyId'>[],
  zones: ZoneRef[],
  id?: string,
): RouteErrors {
  const errors: RouteErrors = {};
  const code = input.code.trim().toUpperCase();

  if (!code) {
    errors.code = 'El código es obligatorio.';
  } else if (!CODE_SHAPE.test(code)) {
    // Es el texto que el liquidador lee en la guía física y busca acá: un espacio o un acento
    // invisible convierte "no la encuentro" en un misterio.
    errors.code = 'Usá letras, números, guión y guión bajo (sin espacios ni acentos).';
  } else if (
    existing.some((r) => r.id !== id && r.partyId === input.partyId
      && r.code.toUpperCase() === code)
  ) {
    errors.code = 'Esta compañía ya tiene una ruta con ese código.';
  }

  if (!input.name.trim()) errors.name = 'El nombre es obligatorio.';

  const origen = zones.find((z) => z.id === input.originZoneId);
  const destino = zones.find((z) => z.id === input.destZoneId);

  if (!input.originZoneId) errors.originZoneId = 'Elegí la zona de origen.';
  else if (!origen) errors.originZoneId = 'Esa zona ya no existe.';
  else if (origen.countryId !== input.countryId) errors.originZoneId = 'La zona es de otro país.';

  if (!input.destZoneId) errors.destZoneId = 'Elegí la zona de destino.';
  else if (!destino) errors.destZoneId = 'Esa zona ya no existe.';
  else if (destino.countryId !== input.countryId) errors.destZoneId = 'La zona es de otro país.';

  // Una ruta que empieza y termina en la misma zona no tiene fila en el tarifario zona→zona, así
  // que cobraría siempre el importe de respaldo sin que nadie entienda por qué.
  if (input.originZoneId && input.originZoneId === input.destZoneId) {
    errors.destZoneId = 'El destino no puede ser la misma zona que el origen.';
  }

  const numericos: [keyof RouteInput, string][] = [
    ['km', input.km], ['stopCount', input.stopCount], ['packageCount', input.packageCount],
    ['weightKg', input.weightKg], ['tollCount', input.tollCount],
    ['tollsAmount', input.tollsAmount], ['durationHours', input.durationHours],
  ];
  for (const [campo, valor] of numericos) {
    if (!NON_NEGATIVE.test((valor ?? '').trim())) errors[campo] = 'Escribí un número sin signo.';
  }

  return errors;
}

export async function saveRoute(input: RouteInput, id?: string): Promise<SaveRouteResult> {
  const [existing, zoneRows] = await Promise.all([
    db().find('route'),
    db().find('zone'),
  ]);
  const zones: ZoneRef[] = zoneRows.map((z) => ({ id: z.id, countryId: z.country_id, code: z.code }));

  const errors = validateRoute(input, existing.map(toDomain), zones, id);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const values: Row = {
    country_id: input.countryId,
    party_id: input.partyId,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    origin_zone_id: input.originZoneId,
    dest_zone_id: input.destZoneId,
    km: input.km.trim(),
    stop_count: Number(input.stopCount),
    package_count: Number(input.packageCount),
    weight_kg: input.weightKg.trim(),
    toll_count: Number(input.tollCount),
    tolls_amount: input.tollsAmount.trim(),
    duration_hours: input.durationHours.trim(),
    notes: input.notes?.trim() || null,
    active: input.active,
  };

  try {
    const saved = id
      ? await db().update('route', id, values)
      : await db().insert('route', values);
    return { status: 'saved', route: toDomain(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Baja LÓGICA. Puede haber liquidaciones emitidas que nombren esta ruta: borrarla dejaría el
 * historial sin la geografía con la que se calculó.
 */
export async function setRouteActive(id: string, active: boolean): Promise<{ error: string | null }> {
  try {
    await db().update('route', id, { active });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteRoute(id: string): Promise<{ error: string | null }> {
  try {
    await db().delete('route', id);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Rutas que usan esta zona, para poder avisar antes de borrarla.
 *
 * La capa de datos ya lo impide por la clave foránea declarada, pero el mensaje que devuelve dice
 * "en uso" sin decir dónde. Esto permite nombrar las rutas concretas.
 */
export async function routesUsingZone(zoneId: string): Promise<RouteDef[]> {
  const rows = await db().find('route');
  return rows
    .map(toDomain)
    .filter((r) => r.originZoneId === zoneId || r.destZoneId === zoneId);
}
