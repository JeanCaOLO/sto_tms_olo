// Del viaje de guía de despacho al viaje que entiende el motor.
//
// Reemplaza a `routeTrip.ts` (2026-10-02, ROADMAP §8). Antes el viaje se ARMABA: se elegía una ruta
// comercial propia del tarifador y se tecleaban los datos del día. Ahora el viaje ya existe —lo
// generó guía de despacho— y acá solo se TRADUCE: los datos del viaje son de solo lectura, y lo
// único que aporta quien liquida son las variables personalizadas PER_TRIP (peajes, recolectas…).
//
// Módulo PURO: recibe el viaje, lo cargado y el perfil; no consulta nada. Así la traducción se
// prueba con objetos planos.

import type { Row } from './data';
import type { TripContext, TripEdits, TripRecord, VarValue } from './types';

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const text = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

/** Fila de la entidad `trip` (vista `tarifas_v_viajes`) → dominio. */
export function toTripRecord(row: Row): TripRecord {
  return {
    id: String(row.id),
    countryId: String(row.country_id),
    routeNumber: String(row.route_number ?? ''),
    // La vista entrega 'YYYY-MM-DD'; un timestamp completo se recorta por las dudas.
    routeDate: String(row.route_date ?? '').slice(0, 10),
    status: String(row.status ?? ''),
    carrierId: text(row.carrier_id),
    carrierName: text(row.carrier_name),
    isOwnFleet: row.is_flota_propia === null || row.is_flota_propia === undefined ? null : !!row.is_flota_propia,
    driverId: text(row.driver_id),
    driverName: text(row.driver_name),
    driverDocument: text(row.driver_document),
    vehicleId: text(row.vehicle_id),
    vehiclePlate: text(row.vehicle_plate),
    vehicleType: text(row.vehicle_type),
    capacityWeightKg: num(row.capacity_weight),
    capacityVolumeM3: num(row.capacity_volume),
    destZoneId: text(row.dest_zone_id),
    destZoneCode: text(row.dest_zone_code),
    destZoneName: text(row.dest_zone_name),
    km: num(row.total_distance),
    totalStops: num(row.total_stops),
    completedStops: num(row.completed_stops),
    weightKg: num(row.total_weight),
    volumeM3: num(row.total_volume),
    actualStartTime: text(row.actual_start_time),
    actualEndTime: text(row.actual_end_time),
    durationHours: num(row.duration_hours),
    guideCount: num(row.guide_count),
    returnCount: num(row.return_count),
    settlementId: text(row.settlement_id),
  };
}

/** Un viaje se liquida si está completado y no tiene una liquidación vigente. */
export function isLiquidable(trip: TripRecord): boolean {
  return trip.status === 'completed' && !trip.settlementId;
}

/** Por qué un viaje NO se puede liquidar, o null si se puede. Para decirlo en pantalla. */
export function notLiquidableReason(trip: TripRecord): string | null {
  if (trip.status !== 'completed') {
    return `El viaje ${trip.routeNumber} no está completado (estado: ${trip.status || 'sin estado'}). `
      + 'Solo se liquidan viajes completados en guía de despacho.';
  }
  if (trip.settlementId) {
    return `El viaje ${trip.routeNumber} ya tiene una liquidación vigente. Para recalcularlo, re-liquidalo.`;
  }
  if (!trip.carrierId) {
    return `El viaje ${trip.routeNumber} no tiene transportista asignado en guía de despacho.`;
  }
  return null;
}

export const emptyTripEdits = (): TripEdits => ({ customVars: {} });

/**
 * Arma el contexto del motor desde el viaje.
 *
 * - `fleetType` sale de `carriers.is_flota_propia`: es la única fuente de verdad. Recibirlo de otro
 *   lado permitiría liquidar un viaje de un tercero con las reglas de flota propia.
 * - `clientCount` son las paradas COMPLETADAS: se paga lo que se hizo, no lo planificado.
 * - La zona del viaje es solo destino: `originLocationId` queda vacío (decisión 2026-10-02).
 * - La capacidad viene en kg y m³ del vehículo; el motor la usa en toneladas.
 *
 * @param partyId perfil de cálculo del transportista, o null si no tiene (solo reglas del país).
 */
export function toTripContext(
  trip: TripRecord,
  edits: TripEdits,
  partyId: string | null,
): TripContext {
  const customVars: Record<string, VarValue> = { ...(edits.customVars ?? {}) };

  return {
    countryId: trip.countryId,
    partyId,
    // Mediodía UTC: la fecha del viaje no se corre de día por zona horaria al derivar el weekday.
    quotedAt: `${trip.routeDate}T12:00:00.000Z`,
    originLocationId: '',
    // Una ubicación por zona: el id de la zona ES el id de la ubicación (ver settlementInput).
    destLocationId: trip.destZoneId ?? '',
    km: trip.km,
    clientCount: trip.completedStops,
    weightKg: trip.weightKg,
    truckTypeId: trip.vehicleType ?? '',
    serviceType: 'STANDARD',
    fleetType: trip.isOwnFleet ? 'OWN' : 'OUTSOURCED',
    carrierId: trip.carrierId,
    driverId: trip.driverId,
    customerId: null,
    durationHours: trip.durationHours,
    truckVolumeM3: trip.capacityVolumeM3,
    truckWeightTons: trip.capacityWeightKg / 1000,
    ...(Object.keys(customVars).length ? { customVars } : {}),
  };
}

/** Los datos del viaje que se muestran de solo lectura en la liquidación, con su etiqueta. */
export function describeTrip(trip: TripRecord): { label: string; value: string }[] {
  const or = (value: string | number | null, fallback = '—') =>
    value === null || value === '' ? fallback : String(value);
  return [
    { label: 'Viaje', value: trip.routeNumber },
    { label: 'Fecha', value: trip.routeDate },
    { label: 'Transportista', value: `${or(trip.carrierName)}${trip.isOwnFleet ? ' (flota propia)' : ''}` },
    { label: 'Conductor', value: or(trip.driverName) },
    { label: 'Vehículo', value: `${or(trip.vehiclePlate)} · ${or(trip.vehicleType)}` },
    { label: 'Zona destino', value: trip.destZoneCode ? `${trip.destZoneCode} · ${or(trip.destZoneName)}` : '—' },
    { label: 'Distancia (km)', value: String(trip.km) },
    { label: 'Paradas', value: `${trip.completedStops} de ${trip.totalStops}` },
    { label: 'Peso (kg)', value: String(trip.weightKg) },
    { label: 'Duración (h)', value: String(trip.durationHours) },
  ];
}
