// De un catálogo y un viaje a la entrada del motor.
//
// Es la mitad PURA del armado: no toca el almacén, no lee la hora, no consulta nada. Por eso se
// puede probar con objetos planos, y por eso las dos pantallas —la liquidación y el Probador—
// pueden compartirla aunque el viaje salga de lugares distintos.
//
// El cambio de fondo respecto de `repository.ts`: la **compañía llega como argumento**, no se
// deriva de la ruta. Sonaba a detalle y era el defecto que hacía que cambiar de transportista en el
// formulario no recalculara nada — el selector decidía a quién se le paga, pero el cálculo seguía
// usando el transportista original de la ruta, con sus reglas, su tarifario y sus variables.

import type { TarifasCatalog } from './catalogLoader';
import type {
  AllocationCriterion, CalcIssue, CalculateInput, CargoSummary, Location, Override, Rule, TripContext,
} from './types';

export interface BuildInputOptions {
  /** Montos corregidos a mano, con su motivo. */
  overrides?: Record<string, Override>;
  /** Reglas puntuales de esta liquidación, que no viven en el catálogo. */
  adhocRules?: Rule[];
  /** Mercancía del viaje (pedidos de sus guías): alimenta la auditoría y el reparto por casa comercial. */
  cargo?: CargoSummary | null;
  allocationCriterion?: AllocationCriterion;
  /** Ubicaciones además de las derivadas de las zonas (casos de prueba). */
  extraLocations?: Location[];
}

export interface BuildInputResult {
  input: CalculateInput;
  /** Problemas detectados al ARMAR, antes de calcular. Se suman a los del motor. */
  issues: CalcIssue[];
  /** Avisos del armado. Se suman a los del motor. */
  warnings: string[];
}

/**
 * Una ubicación por zona.
 *
 * El motor resuelve la zona de un viaje a través de un catálogo de ubicaciones. Con el viaje
 * trayendo su zona destino directamente (`routes.route_type_id` → `zones`), ese catálogo es una
 * correspondencia uno a uno: el id de la zona ES el id de la ubicación.
 */
export function locationsFromZones(catalog: TarifasCatalog): Location[] {
  return catalog.zones
    .filter((z) => z.countryId === catalog.country.id)
    .map((z) => ({ id: z.id, countryId: z.countryId, zoneId: z.id, code: z.code, name: z.name }));
}

/**
 * Arma la entrada del motor.
 *
 * La capacidad del camión ya viene en el viaje (del vehículo del catálogo). Si el viaje nombra un
 * tipo de camión pero su vehículo no tiene capacidad cargada, se avisa: sin ella toda regla por
 * volumen o tonelaje vale cero, y en silencio eso es indistinguible de "no correspondía".
 */
export function buildCalculateInput(
  catalog: TarifasCatalog,
  trip: TripContext,
  options: BuildInputOptions = {},
): BuildInputResult {
  const issues: CalcIssue[] = [];
  const warnings: string[] = [];

  const locations = [...(options.extraLocations ?? []), ...locationsFromZones(catalog)];

  // Un viaje cuyas zonas no están en el catálogo rompería el motor con una excepción. Es preferible
  // decir cuál falta: pasa cuando la zona del viaje no tiene código o es de otro país.
  if (trip.originLocationId && !locations.some((l) => l.id === trip.originLocationId)) {
    issues.push({
      code: 'BASE_NO_DISPONIBLE',
      message: `La zona de origen del viaje no existe en ${catalog.country.name}. `
        + 'Revisá la zona en el catálogo: puede no tener código o estar dada de baja.',
    });
  }
  if (!trip.destLocationId) {
    issues.push({
      code: 'BASE_NO_DISPONIBLE',
      message: 'El viaje no tiene zona de destino: sin ella no se puede tarifar. '
        + 'Asignale el tipo de ruta (zona) en guía de despacho.',
    });
  } else if (!locations.some((l) => l.id === trip.destLocationId)) {
    issues.push({
      code: 'BASE_NO_DISPONIBLE',
      message: `La zona de destino del viaje no existe en ${catalog.country.name}. `
        + 'Revisá la zona en el catálogo: puede no tener código o estar dada de baja.',
    });
  }

  if (trip.truckTypeId && !trip.truckVolumeM3 && !trip.truckWeightTons) {
    warnings.push(
      `El vehículo del viaje ("${trip.truckTypeId}") no tiene capacidad cargada en el catálogo de `
      + 'vehículos: las reglas por volumen o tonelaje no van a aplicar.',
    );
  }

  const input: CalculateInput = {
    country: catalog.country,
    trip,
    rules: catalog.rules,
    zones: catalog.zones,
    zoneGroups: catalog.zoneGroups,
    locations,
    marginPolicy: catalog.marginPolicy,
    partyVariables: catalog.partyVariables,
    costStructure: catalog.costStructure,
    costStructureRows: catalog.costStructureRows,
    defaultCostStructure: catalog.defaultCostStructure,
    defaultCostStructureRows: catalog.defaultCostStructureRows,
    rateTables: catalog.rateTables,
    rateTableRows: catalog.rateTableRows,
    ...(options.overrides ? { overrides: options.overrides } : {}),
    ...(options.adhocRules ? { adhocRules: options.adhocRules } : {}),
    ...(options.cargo ? { cargo: options.cargo } : {}),
    ...(options.allocationCriterion ? { allocationCriterion: options.allocationCriterion } : {}),
  };

  return { input, issues, warnings };
}
