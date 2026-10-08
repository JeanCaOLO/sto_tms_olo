// Todo lo que el motor necesita saber para tarifar un viaje, leído de una vez.
//
// Es la mitad IMPURA del armado: acá se lee —SIEMPRE por la capa de datos, `db()`— y nada más. La
// mitad pura —combinar esto con un viaje y producir la entrada del motor— vive en
// `settlementInput.ts`. Por eso el Probador y la liquidación comparten el armado sin compartir de
// dónde sale el viaje, que es lo único que legítimamente difiere.
//
// Desde 2026-10-02 (ROADMAP §8) el país y las zonas son del catálogo del TMS (entidades externas);
// lo que el cálculo necesita y el catálogo no tiene —redondeo, umbral de pernocta, grupos de zona—
// sigue siendo del tarifador. Nada de esto se lee "por fuera" del ORM.

import { loadCountry, loadCountries } from './catalog-loader/country';
import { loadZones, loadZoneGroups } from './catalog-loader/zones';
import { loadRulesAndPolicy } from './catalog-loader/rules';
import { loadPartyData } from './catalog-loader/party';
import type {
  Country, CostStructure, CostStructureRow, MarginPolicy,
  PartyVariable, RateTable, RateTableRow, Rule, Zone, ZoneGroup,
} from './types';

// Re-exportar para compatibilidad hacia atrás.
export { loadCountries, loadCountry } from './catalog-loader/country';
export { loadZoneGroups, loadZones } from './catalog-loader/zones';

export interface TarifasCatalog {
  country: Country;
  rules: Rule[];
  zones: Zone[];
  zoneGroups: ZoneGroup[];
  marginPolicy: MarginPolicy;
  /** Sólo las de la compañía del viaje. Ver abajo por qué. */
  partyVariables: PartyVariable[];
  costStructure: CostStructure | null;
  costStructureRows: CostStructureRow[];
  /** Estructura por defecto del país: costo de la flota propia sin estructura propia. */
  defaultCostStructure: CostStructure | null;
  defaultCostStructureRows: CostStructureRow[];
  rateTables: RateTable[];
  rateTableRows: RateTableRow[];
}

export class CatalogError extends Error {}

/**
 * Carga todo lo necesario para tarifar un viaje de este país y este perfil de cálculo.
 *
 * Lanza cuando falta algo sin lo cual no hay cálculo posible —el país o su configuración, sus
 * parámetros de costo o su política de margen—, con un mensaje que dice dónde configurarlo.
 * Devolver un catálogo a medias produciría un total plausible calculado sobre huecos.
 */
export async function loadTarifasCatalog(countryId: string, partyId: string | null): Promise<TarifasCatalog> {
  const country = await loadCountry(countryId);
  if (!country) {
    throw new CatalogError(
      `El país "${countryId}" no tiene configuración de cálculo (redondeo, pernocta) en Tarifas. `
        + 'Cargala antes de liquidar.',
    );
  }

  const [
    { rules, marginPolicy },
    zones,
    zoneGroups,
    partyData,
  ] = await Promise.all([
    loadRulesAndPolicy(countryId),
    loadZones(countryId),
    loadZoneGroups(countryId),
    loadPartyData(countryId, partyId),
  ]);

  if (!marginPolicy) {
    throw new CatalogError(
      `No hay política de margen para ${country.name} en Reglas de Tarifa → Política de Margen.`,
    );
  }

  return {
    country,
    rules,
    zones,
    zoneGroups,
    marginPolicy,
    partyVariables: partyData.partyVariables,
    costStructure: partyData.costStructure,
    costStructureRows: partyData.costStructureRows,
    defaultCostStructure: partyData.defaultCostStructure,
    defaultCostStructureRows: partyData.defaultCostStructureRows,
    rateTables: partyData.rateTables,
    rateTableRows: partyData.rateTableRows,
  };
}
