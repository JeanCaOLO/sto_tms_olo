// Contexto del viaje y bolsa de variables del motor.

import type { CustomVarKey, VarValue } from './variables';

export type ServiceType = 'STANDARD' | 'EXPRESS' | 'DEDICATED';
export type FleetType = 'OWN' | 'OUTSOURCED';

/**
 * El viaje tal como lo ve el motor.
 *
 * Trae SOLO lo que el viaje de guía de despacho conoce como dato (ver `tripContext.ts`): distancia,
 * paradas, peso, duración, vehículo, flota, zona destino. Todo lo demás —peajes, recolectas, bultos,
 * atrasos, incidencias o lo que cada compañía necesite— es una variable personalizada (`custom:*`)
 * que se carga al liquidar y llega en `customVars`. Antes eran campos fijos de este tipo; se
 * retiraron (2026-10-02, ROADMAP §8) porque ningún viaje real los trae.
 */
export interface TripContext {
  countryId: string;
  /**
   * Perfil de cálculo con el que se liquida este viaje (`settlementParty`). Es lo que decide QUÉ
   * reglas aplican además de las del país, y contra qué tarifa de outsourcing se costea. Nulo = el
   * transportista no tiene perfil: se liquida solo con las reglas del país.
   * Distinto de `carrierId`, que es el transportista del TMS y solo sirve como variable de regla.
   */
  partyId: string | null;
  quotedAt: string; // ISO 8601 — nunca Date.now() implícito
  /** Vacío = el viaje no informa origen (los viajes de guía de despacho solo traen destino). */
  originLocationId: string;
  destLocationId: string;
  km: number;
  clientCount: number;
  weightKg: number;
  truckTypeId: string;
  serviceType: ServiceType;
  fleetType: FleetType;
  carrierId: string | null;
  driverId: string | null;
  customerId: string | null;
  durationHours: number;
  /** Capacidad del camión del viaje (`vehicles.capacity_*`): m³ y toneladas. 0 = no informada. */
  truckVolumeM3: number;
  truckWeightTons: number;
  /**
   * Valores de las variables personalizadas cargadas para ESTE viaje (las de origen PER_TRIP).
   * Las de origen CONSTANT no hace falta repetirlas acá: el motor toma su valor de la declaración.
   */
  customVars?: Record<string, VarValue>;
}

// Calculadas por el resolver a partir de TripContext + parametría del país — nunca se ingresan a
// mano. originZone/destZone/*ZoneGroup usan el CÓDIGO de zona (no el id interno), igual que el
// resto del vocabulario de predicados.
export interface DerivedVars {
  originZone: string;
  destZone: string;
  originZoneGroup: string;
  destZoneGroup: string;
  overnightNights: number;
  weekday: number; // 0 (domingo) .. 6 (sábado)
}

// Variables que trae el sistema. Sigue siendo un vocabulario CERRADO: si una regla nombrara una
// clave que no está acá, no compila.
export type BuiltinVarKey =
  | 'countryId' | 'km' | 'clientCount' | 'weightKg'
  | 'truckTypeId' | 'serviceType' | 'fleetType' | 'carrierId' | 'customerId'
  | 'durationHours' | 'truckVolumeM3' | 'truckWeightTons'
  | 'originZone' | 'destZone' | 'originZoneGroup' | 'destZoneGroup'
  | 'overnightNights' | 'weekday';

export type VarKey = BuiltinVarKey | CustomVarKey;

/** Todas las del sistema siempre presentes; las personalizadas, las que la compañía haya declarado. */
export type VarBag = Record<BuiltinVarKey, VarValue> & Record<CustomVarKey, VarValue>;

// Subconjunto de VarKey usable como "unidad" en PER_UNIT/TIERED — multiplicar un rate por un
// serviceType no tiene sentido, así que el compilador rechaza ese uso.
export type BuiltinNumericVarKey =
  | 'km' | 'clientCount' | 'weightKg' | 'durationHours'
  | 'truckVolumeM3' | 'truckWeightTons' | 'overnightNights' | 'weekday';

// Una variable personalizada numérica también sirve como unidad; que lo sea de verdad se valida al
// guardar la regla (`kind: 'NUMBER'`), porque el compilador no puede saberlo.
export type NumericVarKey = BuiltinNumericVarKey | CustomVarKey;
