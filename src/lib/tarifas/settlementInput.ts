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
import { resolveTruckCapacity } from './resolver';
import type { CalcIssue, CalculateInput, Location, Override, Rule, TripContext } from './types';

export interface BuildInputOptions {
  /** Montos corregidos a mano, con su motivo. */
  overrides?: Record<string, Override>;
  /** Reglas puntuales de esta liquidación, que no viven en el catálogo. */
  adhocRules?: Rule[];
  /**
   * Ubicaciones además de las derivadas de las zonas.
   *
   * Existe sólo para el camino heredado, que resuelve la zona a través de las tiendas y los tipos
   * de ruta del TMS. Una ruta local declara sus dos zonas y no lo necesita.
   */
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
 * El motor resuelve la zona de un viaje a través de un catálogo de ubicaciones. Con las rutas
 * declarando sus dos zonas directamente, ese catálogo se vuelve una correspondencia uno a uno: el
 * id de la zona ES el id de la ubicación.
 *
 * Reemplaza al andamiaje que existía sólo para cruzar la frontera con el TMS —ubicaciones
 * sintéticas por tienda y por tipo de ruta, tabla de mapeo, zona comodín—, que en la práctica hacía
 * que **toda** regla por zona cayera en la zona comodín y no aplicara nunca.
 */
export function locationsFromZones(catalog: TarifasCatalog): Location[] {
  return catalog.zones
    .filter((z) => z.countryId === catalog.country.id)
    .map((z) => ({ id: z.id, countryId: z.countryId, zoneId: z.id, code: z.code, name: z.name }));
}

/**
 * Arma la entrada del motor.
 *
 * La capacidad del camión se deriva acá del catálogo de vehículos de la compañía, salvo que el
 * viaje ya la traiga: es el único dato que el viaje no puede conocer por sí mismo y que, si falta,
 * hace que toda regla por volumen o tonelaje valga cero sin avisar.
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
  // decir cuál falta: pasa al desactivar una zona que una ruta vieja todavía nombra.
  if (trip.originLocationId && !locations.some((l) => l.id === trip.originLocationId)) {
    issues.push({
      code: 'BASE_NO_DISPONIBLE',
      message: `La zona de origen del viaje no existe en ${catalog.country.name}. `
        + 'Revisá la ruta: puede apuntar a una zona que se dio de baja.',
    });
  }
  if (trip.destLocationId && !locations.some((l) => l.id === trip.destLocationId)) {
    issues.push({
      code: 'BASE_NO_DISPONIBLE',
      message: `La zona de destino del viaje no existe en ${catalog.country.name}. `
        + 'Revisá la ruta: puede apuntar a una zona que se dio de baja.',
    });
  }

  const capacidad = resolveTruckCapacity(
    trip.truckTypeId,
    trip.truckVolumeM3,
    trip.truckWeightTons,
    catalog.partyVehicleTypes,
  );

  if (trip.truckTypeId && capacidad.volumeM3 === 0 && capacidad.weightTons === 0) {
    if (catalog.partyVehicleTypes.length === 0) {
      warnings.push(
        'La compañía no tiene catálogo de vehículos cargado: las reglas por volumen o tonelaje '
        + 'no van a aplicar. Cargalo en Compañías → Vehículos.',
      );
    } else if (!catalog.partyVehicleTypes.some((v) => v.code === trip.truckTypeId)) {
      warnings.push(
        `El vehículo "${trip.truckTypeId}" no está en el catálogo de la compañía: las reglas por `
        + 'volumen o tonelaje no van a aplicar. Cargalo en Compañías → Vehículos.',
      );
    }
  }

  const input: CalculateInput = {
    country: catalog.country,
    trip: {
      ...trip,
      truckVolumeM3: capacidad.volumeM3,
      truckWeightTons: capacidad.weightTons,
    },
    rules: catalog.rules,
    zones: catalog.zones,
    zoneGroups: catalog.zoneGroups,
    locations,
    ownCostParams: catalog.ownCostParams,
    outsourcedCostRates: catalog.outsourcedCostRates,
    marginPolicy: catalog.marginPolicy,
    partyVariables: catalog.partyVariables,
    partyVehicleTypes: catalog.partyVehicleTypes,
    costStructure: catalog.costStructure,
    costStructureRows: catalog.costStructureRows,
    rateTables: catalog.rateTables,
    rateTableRows: catalog.rateTableRows,
    ...(options.overrides ? { overrides: options.overrides } : {}),
    ...(options.adhocRules ? { adhocRules: options.adhocRules } : {}),
  };

  return { input, issues, warnings };
}
