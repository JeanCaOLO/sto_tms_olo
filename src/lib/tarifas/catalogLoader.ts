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

import { db, type Row } from './data';
import type {
  Country, CostStructure, CostStructureRow, MarginPolicy, OutsourcedCostRate, OwnCostParams,
  PartyVariable, RateTable, RateTableRow, RoundingMode, Rule, Zone, ZoneGroup,
} from './types';

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
  costStructure: CostStructure | null;
  costStructureRows: CostStructureRow[];
  rateTables: RateTable[];
  rateTableRows: RateTableRow[];
}

const eq = (column: string, value: unknown) => ({ column, op: 'eq' as const, value });

// ── País ──────────────────────────────────────────────────────────────────────────────────────

/**
 * País del catálogo + su configuración de cálculo. Sin configuración no hay país liquidable: los
 * decimales y el modo de redondeo cambian el total, y adivinarlos daría un número plausible y mal
 * redondeado.
 */
function toCountry(row: Row, settings: Row | undefined): Country | null {
  if (!settings) return null;
  return {
    id: row.id,
    iso2: row.code,
    name: row.name,
    localCurrency: row.currency,
    roundingDecimals: Number(settings.rounding_decimals),
    roundingMode: settings.rounding_mode as RoundingMode,
    overnightThresholdHours: Number(settings.overnight_threshold_hours),
  };
}

export async function loadCountry(countryId: string): Promise<Country | null> {
  const [row, settings] = await Promise.all([
    db().findOne('country', countryId),
    db().find('countrySettings', { where: [eq('country_id', countryId)], limit: 1 }),
  ]);
  return row ? toCountry(row, settings[0]) : null;
}

/** Países del catálogo que tienen configuración de cálculo (los liquidables). */
export async function loadCountries(): Promise<Country[]> {
  const [rows, settings] = await Promise.all([
    db().find('country', { orderBy: [{ column: 'name', locale: true }] }),
    db().find('countrySettings'),
  ]);
  const byCountry = new Map(settings.map((s) => [s.country_id, s]));
  return rows
    .map((row) => toCountry(row, byCountry.get(row.id)))
    .filter((c): c is Country => c !== null);
}

// ── Zonas y grupos ────────────────────────────────────────────────────────────────────────────

function toZoneGroup(row: Row): ZoneGroup {
  return {
    id: row.id,
    countryId: row.country_id ?? '',
    code: row.code,
    name: row.name,
    zoneCodes: Array.isArray(row.zone_codes) ? row.zone_codes.map(String) : [],
  };
}

/**
 * Zonas del catálogo, con su grupo resuelto desde `zoneGroup.zone_codes`. Una zona que no está en
 * ningún grupo queda con `zoneGroupId: null`; en dos grupos del mismo país, gana el primero por
 * código (determinista), y eso se considera un error de configuración que la pantalla de grupos
 * debe impedir.
 */
export async function loadZones(countryId?: string): Promise<Zone[]> {
  const [zones, groups] = await Promise.all([
    db().find('zone', {
      ...(countryId ? { where: [eq('country_id', countryId)] } : {}),
      orderBy: [{ column: 'code', locale: true }],
    }),
    loadZoneGroups(countryId),
  ]);
  const ordered = [...groups].sort((a, b) => a.code.localeCompare(b.code));

  return zones
    .filter((z) => z.code)
    .map((row) => ({
      id: row.id,
      countryId: row.country_id ?? '',
      code: String(row.code),
      name: row.name,
      zoneGroupId: ordered.find(
        (g) => g.countryId === row.country_id && (g.zoneCodes ?? []).includes(String(row.code)),
      )?.id ?? null,
    }));
}

export async function loadZoneGroups(countryId?: string): Promise<ZoneGroup[]> {
  const rows = await db().find('zoneGroup', countryId ? { where: [eq('country_id', countryId)] } : undefined);
  return rows.map(toZoneGroup);
}

// ── Reglas y parámetros del país ──────────────────────────────────────────────────────────────

async function loadRules(countryId: string): Promise<Rule[]> {
  // OR no existe en `Where` (todo es AND): dos consultas en paralelo, país + globales, en vez de
  // traer las reglas de todos los países y descartar el resto en el cliente.
  const [ofCountry, global] = await Promise.all([
    db().find('pricingRule', { where: [eq('active', true), eq('country_id', countryId)] }),
    db().find('pricingRule', { where: [eq('active', true), { column: 'country_id', op: 'isNull' as const }] }),
  ]);
  return [...ofCountry, ...global]
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

async function loadOwnCostParams(countryId: string): Promise<OwnCostParams | null> {
  const [row] = await db().find('ownCostParams', { where: [eq('country_id', countryId)], limit: 1 });
  if (!row) return null;
  return {
    id: row.id,
    countryId,
    costPerKm: String(row.cost_per_km),
    depreciationPerKm: String(row.depreciation_per_km),
    driverDaily: String(row.driver_daily),
  };
}

async function loadOutsourcedCostRates(countryId: string): Promise<OutsourcedCostRate[]> {
  const rows = await db().find('outsourcedCostRate', { where: [eq('country_id', countryId)] });
  return rows.map((row) => ({
    id: row.id,
    countryId,
    carrierId: row.carrier_id,
    truckTypeId: row.truck_type_id,
    flatRate: String(row.flat_rate),
  }));
}

async function loadMarginPolicy(countryId: string): Promise<MarginPolicy | null> {
  const [row] = await db().find('marginPolicy', { where: [eq('country_id', countryId)], limit: 1 });
  if (!row) return null;
  return {
    countryId,
    warnBelow: Number(row.warn_below),
    criticalBelow: Number(row.critical_below),
    requireReasonBelow: Number(row.require_reason_below),
    blockOnLoss: !!row.block_on_loss,
  };
}

// ── Lecturas por compañía (perfil de cálculo) ─────────────────────────────────────────────────
// Sólo las del perfil del viaje. Mezclar las de otro haría que una regla resolviera con un número
// que no le corresponde, o que mirara el tarifario de un tercero.

async function loadPartyVariables(partyId: string | null): Promise<PartyVariable[]> {
  if (!partyId) return [];
  const rows = await db().find('partyVariable', { where: [eq('party_id', partyId)] });
  return rows.map((row) => ({
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

async function loadCostStructure(partyId: string | null): Promise<{
  structure: CostStructure | null;
  rows: CostStructureRow[];
}> {
  if (!partyId) return { structure: null, rows: [] };

  const [row] = await db().find('costStructure', {
    where: [eq('party_id', partyId), eq('active', true)],
    limit: 1,
  });
  if (!row) return { structure: null, rows: [] };

  const rows = await db().find('costStructureRow', { where: [eq('structure_id', row.id)] });
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
    rows: rows.map((r) => ({
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
async function loadRateTables(
  countryId: string,
  partyId: string | null,
): Promise<{ tables: RateTable[]; rows: RateTableRow[] }> {
  const all = await db().find('rateTable', { where: [eq('country_id', countryId), eq('active', true)] });

  const tables: RateTable[] = all
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

  const ids = vigentes.map((t) => t.id);
  const rows = ids.length
    ? await db().find('rateTableRow', { where: [{ column: 'table_id', op: 'in', value: ids }] })
    : [];

  return {
    tables: vigentes,
    rows: rows.map((r) => ({
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
    ownCostParams, marginPolicy, rules, zones, zoneGroups, outsourcedCostRates,
    partyVariables, cost, rateTables,
  ] = await Promise.all([
    loadOwnCostParams(countryId),
    loadMarginPolicy(countryId),
    loadRules(countryId),
    loadZones(countryId),
    loadZoneGroups(countryId),
    loadOutsourcedCostRates(countryId),
    loadPartyVariables(partyId),
    loadCostStructure(partyId),
    loadRateTables(countryId, partyId),
  ]);

  if (!ownCostParams) {
    throw new CatalogError(
      `No hay parámetros de costo para ${country.name} en Reglas de Tarifa → Costos. ` +
      'Sin ellos no se puede calcular el margen.',
    );
  }
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
    ownCostParams,
    outsourcedCostRates,
    marginPolicy,
    partyVariables,
    costStructure: cost.structure,
    costStructureRows: cost.rows,
    rateTables: rateTables.tables,
    rateTableRows: rateTables.rows,
  };
}
