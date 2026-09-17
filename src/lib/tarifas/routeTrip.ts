// De una ruta a un viaje.
//
// Es la pieza que convierte "elegí CAR-CCS" en las variables que el motor necesita. Hasta ahora
// esos siete números —kilómetros, paradas, bultos, peso, peajes, duración— se tecleaban uno por uno
// en cada liquidación, y las dos zonas se elegían de sendos desplegables que casi nadie completaba:
// con la zona vacía, TODA regla por zona dejaba de aplicar sin ninguna señal.
//
// Módulo PURO: recibe la ruta y los datos del día, no consulta nada. Así la derivación se prueba
// con objetos planos, sin montar un formulario.

import type { RouteDef, ServiceType, TripContext, VarValue, CustomVarKey } from './types';

/** Lo que NO sale de la ruta: es del viaje concreto, no de la lane. */
export interface TripExtras {
  /** ISO 8601. Resuelve la vigencia de las reglas y las tasas del día. */
  quotedAt: string;
  /** Compañía a la que se le liquida. Normalmente la dueña de la ruta. */
  partyId: string;
  driverId?: string | null;
  /** Código del catálogo de vehículos de la compañía. */
  truckTypeId?: string;
  serviceType?: ServiceType;
  customerId?: string | null;
  /** Recolectas atendidas: es un servicio del día, no un atributo de la ruta. */
  pickupCount?: number;
  lateMinutes?: number;
  incidentCount?: number;
  /** Capacidad del camión, ya resuelta desde el catálogo de la compañía. */
  truckVolumeM3?: number;
  truckWeightTons?: number;
  /** Variables personalizadas cargadas en este viaje. */
  customVars?: Partial<Record<CustomVarKey, VarValue>>;
  /**
   * Correcciones puntuales sobre lo que dice la ruta. Existe porque un viaje excepcional puede
   * haber hecho más kilómetros o paradas que la lane típica, y obligar a editar la ruta para
   * corregir un viaje cambiaría el cálculo de todos los demás.
   */
  overrides?: Partial<Pick<
    TripContext,
    'km' | 'clientCount' | 'packageCount' | 'weightKg' | 'durationHours' | 'tollCount' | 'tollsAmount'
  >>;
}

/**
 * Arma el contexto del viaje combinando la ruta con los datos del día.
 *
 * `fleetType` NO se recibe: se deriva de la clasificación de la compañía, que es su única fuente
 * de verdad. Recibirlo permitiría liquidar un viaje de un tercero con las reglas de flota propia.
 */
export function toTripContext(
  route: RouteDef,
  extras: TripExtras,
  partyClassification: 'OWN' | 'OUTSOURCED',
): TripContext {
  const o = extras.overrides ?? {};

  return {
    countryId: route.countryId,
    partyId: extras.partyId,
    quotedAt: extras.quotedAt,
    // El id de la zona sirve directamente como ubicación: el catálogo de ubicaciones del motor se
    // arma con una entrada por zona. Ver `buildCalculateInput`.
    originLocationId: route.originZoneId,
    destLocationId: route.destZoneId,

    km: pick(o.km, route.km),
    clientCount: pick(o.clientCount, route.stopCount),
    packageCount: pick(o.packageCount, route.packageCount),
    weightKg: pick(o.weightKg, route.weightKg),
    durationHours: pick(o.durationHours, route.durationHours),
    tollCount: pick(o.tollCount, route.tollCount),
    tollsAmount: o.tollsAmount ?? route.tollsAmount,

    truckTypeId: extras.truckTypeId ?? '',
    serviceType: extras.serviceType ?? 'STANDARD',
    fleetType: partyClassification === 'OWN' ? 'OWN' : 'OUTSOURCED',
    // El motor pregunta por `carrierId` en algunas reglas; es la misma compañía que se liquida.
    carrierId: partyClassification === 'OUTSOURCED' ? extras.partyId : null,
    driverId: extras.driverId ?? null,
    customerId: extras.customerId ?? null,

    pickupCount: extras.pickupCount ?? 0,
    lateMinutes: extras.lateMinutes ?? 0,
    incidentCount: extras.incidentCount ?? 0,
    truckVolumeM3: extras.truckVolumeM3 ?? 0,
    truckWeightTons: extras.truckWeightTons ?? 0,

    ...(extras.customVars ? { customVars: extras.customVars } : {}),
  };
}

/**
 * Un `undefined` toma el valor de la ruta; un 0 explícito NO.
 *
 * La diferencia importa: "este viaje no tuvo peajes" es un dato, y dejar que la ruta lo pise
 * cobraría peajes que no hubo.
 */
function pick(override: number | undefined, fromRoute: number): number {
  return override === undefined || override === null ? fromRoute : override;
}

/** Campos del viaje que la ruta aporta, para poder mostrar de dónde salió cada número. */
export const CAMPOS_DE_LA_RUTA = [
  'km', 'clientCount', 'packageCount', 'weightKg', 'durationHours', 'tollCount', 'tollsAmount',
  'originLocationId', 'destLocationId',
] as const;

export type CampoDeLaRuta = typeof CAMPOS_DE_LA_RUTA[number];

/**
 * Qué campos del viaje fueron corregidos a mano respecto de lo que dice la ruta.
 *
 * Lo usa la pantalla para marcar "ajustado" al lado del número: un dato que no coincide con la
 * ruta tiene que verse, porque es la diferencia entre heredar y decidir.
 */
export function camposAjustados(route: RouteDef, trip: TripContext): CampoDeLaRuta[] {
  const ajustados: CampoDeLaRuta[] = [];
  if (trip.km !== route.km) ajustados.push('km');
  if (trip.clientCount !== route.stopCount) ajustados.push('clientCount');
  if (trip.packageCount !== route.packageCount) ajustados.push('packageCount');
  if (trip.weightKg !== route.weightKg) ajustados.push('weightKg');
  if (trip.durationHours !== route.durationHours) ajustados.push('durationHours');
  if (trip.tollCount !== route.tollCount) ajustados.push('tollCount');
  if (String(trip.tollsAmount) !== String(route.tollsAmount)) ajustados.push('tollsAmount');
  return ajustados;
}
