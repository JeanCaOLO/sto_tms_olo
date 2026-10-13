// Esquema de claves y variables para tarifarios.

import { type PartyVariable, type RateTable, type VarKey } from '../types';

/**
 * Variables CATEGÓRICAS de la clave de un tarifario: la fila casa por igualdad con un valor exacto
 * (una zona, un tipo de camión) o con un comodín.
 */
export const RATE_TABLE_CATEGORICAL_VARS = [
  'originZone', 'destZone', 'originZoneGroup', 'destZoneGroup',
  'truckTypeId', 'serviceType', 'fleetType', 'carrierId', 'customerId',
  'countryId', 'weekday',
] as const satisfies readonly VarKey[];

/**
 * Variables NUMÉRICAS que pueden ir en la clave: la celda de la fila es un RANGO ("0..100",
 * "101..300", "301..") y casa con todo el tramo, así que 181 km cae en "101..300". Para el valor
 * exacto de una magnitud (181 no casa con 180) la clave por igualdad no sirve; el rango sí.
 */
export const RATE_TABLE_RANGE_VARS = [
  'km', 'weightKg', 'clientCount', 'durationHours', 'truckWeightTons', 'truckVolumeM3',
] as const satisfies readonly VarKey[];

/** Todas las del sistema que pueden formar la clave. */
export const RATE_TABLE_KEY_VARS = [...RATE_TABLE_CATEGORICAL_VARS, ...RATE_TABLE_RANGE_VARS] as const;

export const isRangeKeyVar = (key: string): boolean =>
  (RATE_TABLE_RANGE_VARS as readonly string[]).includes(key);

/** ¿Es una variable personalizada de una compañía (`custom:*`)? */
export const isCustomKeyVar = (key: string): key is `custom:${string}` => key.startsWith('custom:');

/**
 * Variables que se pueden elegir para la clave de un tarifario de una compañía: las del sistema más
 * las personalizadas ACTIVAS de esa compañía. Una personalizada numérica admite rangos como las
 * magnitudes del sistema; una de texto, valores exactos.
 */
export function keyVarsFor(partyVariables: PartyVariable[] = []): VarKey[] {
  return [
    ...RATE_TABLE_KEY_VARS,
    ...partyVariables.filter((v) => v.active).map((v) => v.key),
  ];
}

/**
 * Columnas de clave que nombran una ZONA, por su código.
 *
 * Existen para reponer una protección que se perdió al absorber las tarifas zona-a-zona: aquella
 * tabla guardaba el id de la zona y el esquema impedía borrar una zona en uso. Un tarifario guarda
 * el CÓDIGO —es lo que el motor compara— y un código no es una clave foránea, así que sin este
 * chequeo borrar una zona dejaría filas huérfanas que cobran a nadie.
 */
export const ZONE_KEY_VARS: readonly VarKey[] = ['originZone', 'destZone'];

export function keyFingerprint(key: string[]): string {
  return key.map((v) => v.toUpperCase()).join('\0');
}

export function mismaClave(a: VarKey[], b: VarKey[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}
