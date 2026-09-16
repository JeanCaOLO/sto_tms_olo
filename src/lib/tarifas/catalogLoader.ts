// Todo lo que el motor necesita saber para tarifar un viaje, leído de una vez.
//
// Es la mitad IMPURA del armado: acá se toca el almacén y nada más. La mitad pura —combinar esto
// con un viaje y producir la entrada del motor— vive en `settlementInput.ts`.
//
// Por qué están separadas: hasta ahora el armado entero vivía en `repository.ts`, cuyo contrato
// exigía una ruta, tiendas y tipos de ruta del TMS. Un viaje inventado no tiene nada de eso, así
// que el Probador del motor **se escribió aparte** — y desde entonces las dos pantallas divergen.
// Ya pasó con las zonas (la regla funcionaba en la prueba y nunca en producción) y casi vuelve a
// pasar con los tarifarios. Partirlo por acá es lo que permite que compartan el armado sin
// compartir de dónde sale el viaje, que es lo único que legítimamente difiere.

import { loadDatabase } from './localData/store';
import type {
  Country, CostStructure, CostStructureRow, MarginPolicy, OutsourcedCostRate, OwnCostParams,
  PartyVariable, PartyVehicleType, RateTable, RateTableRow, Rule, Zone, ZoneGroup,
} from './types';

/** Perfil liquidable, en la forma mínima que necesitan la resolución de compañía y el armado. */
export interface PartyRef {
  id: string;
  countryId: string;
  classification: 'OWN' | 'OUTSOURCED';
  carrierId: string | null;
  status: string;
  name: string;
}

export interface TarifasCatalog {
  country: Country;
  rules: Rule[];
  zones: Zone[];
  zoneGroups: ZoneGroup[];
  ownCostParams: OwnCostParams;
  outsourcedCostRates: OutsourcedCostRate[];
  marginPolicy: MarginPolicy;
  /** Sólo las de la compañía del viaje. Ver abajo por qué. */
  partyVariables: PartyVariable[];
  partyVehicleTypes: PartyVehicleType[];
  costStructure: CostStructure | null;
  costStructureRows: CostStructureRow[];
  rateTables: RateTable[];
  rateTableRows: RateTableRow[];
}

// ── Lecturas por país ─────────────────────────────────────────────────────────────────────────

export function loadCountry(countryId: string): Country | null {
  const row = loadDatabase().countries.find((c) => c.id === countryId);
  if (!row) return null;
  return {
    id: row.id,
    iso2: row.iso2,
    name: row.name,
    localCurrency: row.local_currency,
    roundingDecimals: Number(row.rounding_decimals),
    roundingMode: row.rounding_mode,
    overnightThresholdHours: Number(row.overnight_threshold_hours),
    ...(row.allow_negative_total === undefined ? {} : { allowNegativeTotal: !!row.allow_negative_total }),
  };
}

export function loadCountries(): Country[] {
  return loadDatabase().countries
    .map((c) => loadCountry(c.id))
    .filter((c): c is Country => c !== null);
}

export function loadParties(): PartyRef[] {
  return loadDatabase().settlementParties.map((p) => ({
    id: p.id,
    countryId: p.country_id,
    classification: p.classification,
    carrierId: p.carrier_id ?? null,
    status: p.status,
    name: p.name,
  }));
}

export function loadZones(countryId?: string): Zone[] {
  return loadDatabase().zones
    .filter((z) => !countryId || z.country_id === countryId)
    .map((row) => ({
      id: row.id,
      countryId: row.country_id ?? '',
      zoneGroupId: row.zone_group_id ?? null,
      code: row.code,
      name: row.name,
    }));
}

function loadZoneGroups(): ZoneGroup[] {
  return loadDatabase().zoneGroups.map((row) => ({
    id: row.id, countryId: row.country_id ?? '', code: row.code, name: row.name,
  }));
}

function loadRules(countryId: string): Rule[] {
  return loadDatabase().pricingRules
    .filter((r) => r.active && (r.country_id === countryId || !r.country_id))
    .map((row) => ({
      id: row.id,
      // `country_id` nulo = regla global: se estampa el país actual, porque el resolver filtra por
      // país exacto y si no quedaría fuera de todos.
      countryId: (row.country_id as string | null) ?? countryId,
      code: row.code,
      name: row.name,
      stage: row.stage,
      priority: Number(row.priority),
      stacking: row.stacking,
      scope: (row.scope ?? 'COUNTRY'),
      partyId: row.party_id ?? null,
      exclusionGroup: row.exclusion_group ?? null,
      conditions: row.conditions,
      expression: row.expression,
      description: row.description ?? null,
      reason: row.reason ?? null,
      effect: row.effect ?? null,
      builder: row.builder ?? null,
      effectiveFrom: row.effective_from ?? null,
      effectiveTo: row.effective_to ?? null,
      isAdhoc: !!row.is_adhoc,
      active: !!row.active,
      version: Number(row.version ?? 1),
    }));
}


function loadOwnCostParams(countryId: string): OwnCostParams | null {
  const row = loadDatabase().ownCostParams.find((p) => p.country_id === countryId);
  if (!row) return null;
  return {
    id: row.id,
    countryId,
    costPerKm: String(row.cost_per_km),
    depreciationPerKm: String(row.depreciation_per_km),
    driverDaily: String(row.driver_daily),
  };
}

function loadOutsourcedCostRates(countryId: string): OutsourcedCostRate[] {
  return loadDatabase().outsourcedCostRates
    .filter((r) => r.country_id === countryId)
    .map((row) => ({
      id: row.id,
      countryId,
      carrierId: row.carrier_id,
      truckTypeId: row.truck_type_id,
      flatRate: String(row.flat_rate),
    }));
}

function loadMarginPolicy(countryId: string): MarginPolicy | null {
  const row = loadDatabase().marginPolicies.find((p) => p.country_id === countryId);
  if (!row) return null;
  return {
    countryId,
    warnBelow: Number(row.warn_below),
    criticalBelow: Number(row.critical_below),
    requireReasonBelow: Number(row.require_reason_below),
    blockOnLoss: !!row.block_on_loss,
  };
}

// ── Lecturas por compañía ─────────────────────────────────────────────────────────────────────
// Sólo las de la compañía del viaje. Mezclar las de otra haría que una regla resolviera con un
// número que no le corresponde, o que mirara el tarifario de un tercero.

function loadPartyVariables(partyId: string | null): PartyVariable[] {
  if (!partyId) return [];
  return loadDatabase().partyVariables
    .filter((v) => v.party_id === partyId)
    .map((row) => ({
      id: row.id,
      partyId: row.party_id,
      key: row.key,
      label: row.label,
      kind: row.kind,
      origin: row.origin,
      defaultValue: row.default_value ?? null,
      unit: row.unit ?? null,
      active: !!row.active,
    }));
}

function loadPartyVehicleTypes(partyId: string | null): PartyVehicleType[] {
  if (!partyId) return [];
  return loadDatabase().partyVehicleTypes
    .filter((v) => v.party_id === partyId && v.active)
    .map((v) => ({
      id: v.id,
      partyId: v.party_id,
      code: v.code,
      name: v.name,
      volumeM3: Number(v.volume_m3) || 0,
      weightTons: Number(v.weight_tons) || 0,
      notes: v.notes ?? null,
      active: !!v.active,
    }));
}

function loadCostStructure(partyId: string | null): {
  structure: CostStructure | null;
  rows: CostStructureRow[];
} {
  if (!partyId) return { structure: null, rows: [] };

  const db = loadDatabase();
  const row = db.costStructures.find((c) => c.party_id === partyId && c.active);
  if (!row) return { structure: null, rows: [] };

  return {
    structure: {
      id: row.id,
      partyId: row.party_id,
      countryId: row.country_id,
      name: row.name,
      operatingDaysPerMonth: Number(row.operating_days_per_month),
      effectiveFrom: row.effective_from ?? null,
      active: !!row.active,
      notes: row.notes ?? null,
    },
    rows: db.costStructureRows
      .filter((r) => r.structure_id === row.id)
      .map((r) => ({
        id: r.id,
        structureId: r.structure_id,
        code: r.code,
        label: r.label,
        driver: r.driver,
        amount: String(r.amount),
        sign: r.sign,
        appliesWhen: r.applies_when ?? null,
        unit: r.unit ?? null,
        order: Number(r.row_order ?? 0),
        active: !!r.active,
      })),
  };
}

/**
 * Tarifarios del país MÁS los de la compañía. Los de otra compañía no se cargan: una regla no
 * debería poder mirar el tarifario de un tercero.
 */
function loadRateTables(
  countryId: string,
  partyId: string | null,
): { tables: RateTable[]; rows: RateTableRow[] } {
  const db = loadDatabase();

  const tables: RateTable[] = db.rateTables
    .filter((t) => t.country_id === countryId && t.active)
    .filter((t) => !t.party_id || t.party_id === partyId)
    .map((t) => ({
      id: t.id,
      countryId: t.country_id,
      partyId: t.party_id ?? null,
      code: t.code,
      name: t.name,
      keyColumns: t.key_columns ?? [],
      active: !!t.active,
    }));

  // Un tarifario de compañía con el MISMO código que uno de país lo reemplaza — mismo mecanismo
  // que el alcance de las reglas, para que no haya dos formas distintas de especializar.
  const codigosDeCompania = new Set(tables.filter((t) => t.partyId).map((t) => t.code));
  const vigentes = tables.filter((t) => t.partyId || !codigosDeCompania.has(t.code));

  const idsVigentes = new Set(vigentes.map((t) => t.id));
  return {
    tables: vigentes,
    rows: db.rateTableRows
      .filter((r) => idsVigentes.has(r.table_id))
      .map((r) => ({
        id: r.id,
        tableId: r.table_id,
        key: r.key ?? [],
        amount: String(r.amount),
        order: Number(r.row_order ?? 0),
        active: !!r.active,
      })),
  };
}

// ── El catálogo completo ──────────────────────────────────────────────────────────────────────

export class CatalogError extends Error {}

/**
 * Carga todo lo necesario para tarifar un viaje de este país y esta compañía.
 *
 * Lanza cuando falta algo sin lo cual no hay cálculo posible —el país, sus parámetros de costo o su
 * política de margen—, con un mensaje que dice dónde configurarlo. Devolver un catálogo a medias
 * produciría un total plausible calculado sobre huecos.
 */
export function loadTarifasCatalog(countryId: string, partyId: string | null): TarifasCatalog {
  const country = loadCountry(countryId);
  if (!country) {
    throw new CatalogError(
      `No hay un país "${countryId}" configurado en Tarifas. Cargalo antes de liquidar.`,
    );
  }

  const ownCostParams = loadOwnCostParams(countryId);
  if (!ownCostParams) {
    throw new CatalogError(
      `No hay parámetros de costo para ${country.name} en Reglas de Tarifa → Costos. ` +
      'Sin ellos no se puede calcular el margen.',
    );
  }

  const marginPolicy = loadMarginPolicy(countryId);
  if (!marginPolicy) {
    throw new CatalogError(
      `No hay política de margen para ${country.name} en Reglas de Tarifa → Política de Margen.`,
    );
  }

  const { structure, rows: structureRows } = loadCostStructure(partyId);
  const { tables, rows: tableRows } = loadRateTables(countryId, partyId);

  return {
    country,
    rules: loadRules(countryId),
    zones: loadZones(),
    zoneGroups: loadZoneGroups(),
    ownCostParams,
    outsourcedCostRates: loadOutsourcedCostRates(countryId),
    marginPolicy,
    partyVariables: loadPartyVariables(partyId),
    partyVehicleTypes: loadPartyVehicleTypes(partyId),
    costStructure: structure,
    costStructureRows: structureRows,
    rateTables: tables,
    rateTableRows: tableRows,
  };
}
