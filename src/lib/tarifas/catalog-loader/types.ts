// Forma del catálogo que el motor necesita para tarifar un viaje.

import type {
  Country, CostStructure, CostStructureRow, MarginPolicy,
  PartyVariable, RateTable, RateTableRow, Rule, Zone, ZoneGroup,
} from '../types';

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
