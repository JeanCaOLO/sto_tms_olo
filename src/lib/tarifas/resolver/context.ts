// Derivación de variables del contexto del viaje. Transforma trip + catálogo en un VarBag
// que alimenta el evaluador de reglas.

import type {
  CalculateInput, PartyVariable, VarBag, Zone, ZoneGroup,
} from '../types';
import { exactNumber } from '../money';

export interface DerivedContext {
  vars: VarBag;
  originZoneId: string;
  destZoneId: string;
  /** Igual a vars.overnightNights, pero tipado number (VarBag es string|number) para cost.ts/index.ts. */
  overnightNights: number;
}

/** Búsqueda con error explícito si no encuentra. */
function findOrThrow<T>(items: T[], pred: (item: T) => boolean, message: string): T {
  const found = items.find(pred);
  if (!found) throw new Error(message);
  return found;
}

/** Código del grupo de la zona, o vacío si la zona no pertenece a ningún grupo. */
function zoneGroupCode(zone: Zone | null, zoneGroups: ZoneGroup[]): string {
  if (!zone || !zone.zoneGroupId) return '';
  return findOrThrow(
    zoneGroups,
    (g) => g.id === zone.zoneGroupId,
    `Grupo de zona no encontrado para la zona "${zone.code}" (zoneGroupId=${zone.zoneGroupId})`,
  ).code;
}

/** Noches de pernocta: 0 mientras durationHours ≤ umbral; a partir de ahí, un bloque por umbral. */
export function computeOvernightNights(durationHours: number, overnightThresholdHours: number): number {
  if (overnightThresholdHours <= 0) return 0;
  if (durationHours <= overnightThresholdHours) return 0;
  return Math.floor(durationHours / overnightThresholdHours);
}

/** Día de la semana (0=domingo..6=sábado) desde fecha ISO. */
export function computeWeekday(quotedAtIso: string): number {
  return new Date(quotedAtIso).getUTCDay();
}

/**
 * Valor de cada variable personalizada de la compañía.
 * - CONSTANT: valor fijo de la declaración.
 * - PER_TRIP: lo cargado en este viaje, o el default.
 */
export function resolveCustomVars(
  partyVariables: PartyVariable[],
  tripValues: Record<string, number | string | null> | undefined,
): Record<string, number | string> {
  const resolved: Record<string, number | string> = {};

  for (const variable of partyVariables) {
    if (!variable.active) continue;

    const raw = variable.origin === 'PER_TRIP'
      ? tripValues?.[variable.key] ?? variable.defaultValue
      : variable.defaultValue;

    if (variable.kind === 'NUMBER') {
      resolved[variable.key] = exactNumber(raw) ?? 0;
    } else {
      resolved[variable.key] = raw === null || raw === undefined ? '' : String(raw);
    }
  }

  return resolved;
}

/** Zona de una ubicación del viaje. Un id vacío → null. */
function zoneOf(
  locationId: string,
  locations: CalculateInput['locations'],
  zones: Zone[],
  which: 'origen' | 'destino',
): Zone | null {
  if (!locationId) return null;
  const location = findOrThrow(
    locations, (l) => l.id === locationId,
    `Localidad de ${which} no encontrada: ${locationId}`,
  );
  return findOrThrow(
    zones, (z) => z.id === location.zoneId,
    `Zona no encontrada para la localidad "${location.code}"`,
  );
}

/** Genera VarBag y zona IDs a partir de trip + catálogo. */
export function deriveContext(
  input: Pick<
    CalculateInput,
    'trip' | 'country' | 'zones' | 'zoneGroups' | 'locations' | 'partyVariables'
  >,
): DerivedContext {
  const { trip, country, zones, zoneGroups, locations } = input;

  const originZone = zoneOf(trip.originLocationId, locations, zones, 'origen');
  const destZone = zoneOf(trip.destLocationId, locations, zones, 'destino');

  const overnightNights = computeOvernightNights(trip.durationHours, country.overnightThresholdHours);

  const vars: VarBag = {
    countryId: trip.countryId,
    km: trip.km,
    clientCount: trip.clientCount,
    weightKg: trip.weightKg,
    truckTypeId: trip.truckTypeId,
    serviceType: trip.serviceType,
    fleetType: trip.fleetType,
    carrierId: trip.carrierId ?? '',
    customerId: trip.customerId ?? '',
    durationHours: trip.durationHours,
    truckVolumeM3: trip.truckVolumeM3 || 0,
    truckWeightTons: trip.truckWeightTons || 0,
    originZone: originZone?.code ?? '',
    destZone: destZone?.code ?? '',
    originZoneGroup: zoneGroupCode(originZone, zoneGroups),
    destZoneGroup: zoneGroupCode(destZone, zoneGroups),
    overnightNights,
    weekday: computeWeekday(trip.quotedAt),
    ...resolveCustomVars(input.partyVariables ?? [], trip.customVars),
  };

  return { vars, originZoneId: originZone?.id ?? '', destZoneId: destZone?.id ?? '', overnightNights };
}
