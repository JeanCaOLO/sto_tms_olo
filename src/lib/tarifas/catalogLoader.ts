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

import { db, findMany, onDataWrite, primaryKeyOf, recordCatalog, type EntityName, type FindRequest, type Row } from './data';
import { toCostStructure, toCostStructureRow } from './costStructureDataSource';
import type {
  Country, CostStructure, CostStructureRow, MarginPolicy,
  PartyVariable, RateTable, RateTableRow, RoundingMode, Rule, Zone, ZoneGroup,
} from './types';

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
    db().find('zone', zoneQuery(countryId)),
    loadZoneGroups(countryId),
  ]);
  return buildZones(zones, groups);
}

const zoneQuery = (countryId?: string) => ({
  ...(countryId ? { where: [eq('country_id', countryId)] } : {}),
  orderBy: [{ column: 'code', locale: true }],
});

function buildZones(zones: Row[], groups: ZoneGroup[]): Zone[] {
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

const zoneGroupQuery = (countryId?: string) => (countryId ? { where: [eq('country_id', countryId)] } : undefined);

export async function loadZoneGroups(countryId?: string): Promise<ZoneGroup[]> {
  const rows = await db().find('zoneGroup', zoneGroupQuery(countryId));
  return rows.map(toZoneGroup);
}

// ── Reglas y parámetros del país ──────────────────────────────────────────────────────────────

async function loadRules(countryId: string): Promise<Rule[]> {
  // También las inactivas: el resolver las descarta con su motivo, y una regla inactiva de compañía
  // es la forma de apagar para ella una regla del país.
  // OR no existe en `Where` (todo es AND): dos consultas en paralelo, país + globales, en vez de
  // traer las reglas de todos los países y descartar el resto en el cliente.
  const [ofCountry, global] = await Promise.all([
    db().find('pricingRule', RULES_OF_COUNTRY(countryId)),
    db().find('pricingRule', RULES_GLOBAL),
  ]);
  return buildRules(ofCountry, global, countryId);
}

const RULES_OF_COUNTRY = (countryId: string) => ({ where: [eq('country_id', countryId)] });
const RULES_GLOBAL = { where: [{ column: 'country_id', op: 'isNull' as const }] };

function buildRules(ofCountry: Row[], global: Row[], countryId: string): Rule[] {
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

async function loadMarginPolicy(countryId: string): Promise<MarginPolicy | null> {
  const [row] = await db().find('marginPolicy', { where: [eq('country_id', countryId)], limit: 1 });
  return buildMarginPolicy(row, countryId);
}

function buildMarginPolicy(row: Row | undefined, countryId: string): MarginPolicy | null {
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
  return buildPartyVariables(rows);
}

function buildPartyVariables(rows: Row[]): PartyVariable[] {
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

/**
 * Estructura activa de una compañía (`partyId`) o la estructura por defecto de un país (`countryId`,
 * la que no tiene compañía). Sin ninguno de los dos, nada.
 */
function costStructureQuery(scope: { partyId?: string | null; countryId?: string }) {
  const where = scope.partyId
    ? [eq('party_id', scope.partyId), eq('active', true)]
    : scope.countryId
      ? [{ column: 'party_id', op: 'isNull' as const }, eq('country_id', scope.countryId), eq('active', true)]
      : null;
  return where ? { where, limit: 1 } : null;
}

const costRowsQuery = (structureId: string) => ({ where: [eq('structure_id', structureId)] });

function buildCostStructure(row: Row | undefined, rows: Row[]): { structure: CostStructure | null; rows: CostStructureRow[] } {
  if (!row) return { structure: null, rows: [] };
  return { structure: toCostStructure(row), rows: rows.map(toCostStructureRow) };
}

async function loadCostStructure(scope: { partyId?: string | null; countryId?: string }): Promise<{
  structure: CostStructure | null;
  rows: CostStructureRow[];
}> {
  const query = costStructureQuery(scope);
  if (!query) return { structure: null, rows: [] };

  const [row] = await db().find('costStructure', query);
  if (!row) return { structure: null, rows: [] };

  return buildCostStructure(row, await db().find('costStructureRow', costRowsQuery(row.id)));
}

/**
 * Tarifarios del país MÁS los de la compañía. Los de otra compañía no se cargan: una regla no
 * debería poder mirar el tarifario de un tercero.
 */
async function loadRateTables(
  countryId: string,
  partyId: string | null,
): Promise<{ tables: RateTable[]; rows: RateTableRow[] }> {
  const all = await db().find('rateTable', rateTablesQuery(countryId));
  const tables = pickRateTables(all, partyId);
  const rows = tables.length
    ? await db().find('rateTableRow', rateTableRowsQuery(tables.map((t) => t.id)))
    : [];
  return { tables, rows: buildRateTableRows(rows) };
}

const rateTablesQuery = (countryId: string) => ({ where: [eq('country_id', countryId), eq('active', true)] });
const rateTableRowsQuery = (ids: string[]) => ({ where: [{ column: 'table_id', op: 'in' as const, value: ids }] });

/** Los tarifarios que valen para esta compañía: los del país y los suyos (los suyos reemplazan al del mismo código). */
function pickRateTables(all: Row[], partyId: string | null): RateTable[] {
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
  return tables.filter((t) => t.partyId || !codigosDeCompania.has(t.code));
}

function buildRateTableRows(rows: Row[]): RateTableRow[] {
  return rows.map((r) => ({
    id: r.id,
    tableId: r.table_id,
    key: r.key ?? [],
    amount: String(r.amount),
    order: Number(r.row_order ?? 0),
    active: !!r.active,
  }));
}

// ── El catálogo completo ──────────────────────────────────────────────────────────────────────

export class CatalogError extends Error {}

// ── Caché del catálogo ─────────────────────────────────────────────────────────────────────────
//
// Reglas, tarifarios, zonas y estructuras de costo cambian poco y calcular un viaje los volvía a traer
// enteros (~14 llamadas) en cada cálculo y en cada edición. Se guardan unos segundos y se descartan:
//   · al instante, cuando ESTA sesión escribe cualquier entidad del catálogo;
//   · por tiempo (TTL), para los cambios que hace otra persona.
// Las liquidaciones, los viajes y los pedidos NO pasan por acá: se leen siempre frescos.

// 5 min: reglas, tarifarios y zonas casi no cambian, y sin `/batch` en el backend cada lectura del
// catálogo cuesta ~9 s (11 lecturas sueltas que se encolan). Lo que escribe esta sesión se descarta al instante.
const CATALOG_TTL_MS = 5 * 60_000;
const CATALOG_ENTITIES = new Set<EntityName>([
  'country', 'countrySettings', 'marginPolicy', 'pricingRule', 'pricingTemplate', 'zone', 'zoneGroup',
  'partyVariable', 'settlementParty', 'costStructure', 'costStructureRow', 'rateTable', 'rateTableRow',
]);
const catalogCache = new Map<string, { at: number; promise: Promise<TarifasCatalog> }>();

/** Descarta el catálogo guardado. Lo llaman las escrituras del catálogo y los tests. */
export function invalidateCatalogCache(): void {
  catalogCache.clear();
}

onDataWrite((touched) => {
  for (const entity of touched) {
    if (CATALOG_ENTITIES.has(entity)) {
      invalidateCatalogCache();
      return;
    }
  }
});


/**
 * Carga todo lo necesario para tarifar un viaje de este país y este perfil de cálculo.
 *
 * Lanza cuando falta algo sin lo cual no hay cálculo posible —el país o su configuración, sus
 * parámetros de costo o su política de margen—, con un mensaje que dice dónde configurarlo.
 * Devolver un catálogo a medias produciría un total plausible calculado sobre huecos.
 */
export async function loadTarifasCatalog(
  countryId: string,
  partyId: string | null,
  options: { fresh?: boolean } = {},
): Promise<TarifasCatalog> {
  // Solo contra la API: con el driver JSON (demo y tests) leer es gratis y un caché solo estorbaría.
  if (db().kind !== 'http') return fetchCatalog(countryId, partyId);

  const key = `${countryId}|${partyId ?? ''}`;
  const hit = catalogCache.get(key);
  // `fresh` salta la caché (se usa antes de emitir, donde un dato viejo se paga) pero deja lo leído
  // guardado para que lo que se haga después en la pantalla ya parta de lo último.
  if (!options.fresh && hit && Date.now() - hit.at < CATALOG_TTL_MS) {
    recordCatalog(true);
    return structuredClone(await hit.promise);
  }
  recordCatalog(false);

  const promise = fetchCatalog(countryId, partyId);
  const entry = { at: Date.now(), promise };
  catalogCache.set(key, entry);
  // Un fallo (falta configuración, red) no se guarda: el siguiente intento vuelve a leer.
  promise.catch(() => { if (catalogCache.get(key) === entry) catalogCache.delete(key); });
  return structuredClone(await promise);
}

/**
 * Lee el catálogo en DOS idas y vueltas a la API (antes eran ~14): primero todo lo que se puede pedir
 * sin saber nada más, y después las filas hijas (renglones de costo y de tarifario) de lo que apareció.
 */
async function fetchCatalog(countryId: string, partyId: string | null): Promise<TarifasCatalog> {
  const partyCost = costStructureQuery({ partyId });
  const defaultCost = costStructureQuery({ countryId });

  const requests: FindRequest[] = [
    { entity: 'country', options: { where: [eq(primaryKeyOf('country'), countryId)], limit: 1 } },
    { entity: 'countrySettings', options: { where: [eq('country_id', countryId)], limit: 1 } },
    { entity: 'marginPolicy', options: { where: [eq('country_id', countryId)], limit: 1 } },
    { entity: 'pricingRule', options: RULES_OF_COUNTRY(countryId) },
    { entity: 'pricingRule', options: RULES_GLOBAL },
    { entity: 'zone', options: zoneQuery(countryId) },
    { entity: 'zoneGroup', options: zoneGroupQuery(countryId) },
    { entity: 'rateTable', options: rateTablesQuery(countryId) },
  ];
  if (partyId) requests.push({ entity: 'partyVariable', options: { where: [eq('party_id', partyId)] } });
  if (partyCost) requests.push({ entity: 'costStructure', options: partyCost });
  if (defaultCost) requests.push({ entity: 'costStructure', options: defaultCost });

  const first = await findMany(db(), requests);
  const [countryRows, settingsRows, marginRows, ofCountry, global, zoneRows, groupRows, rateTableRows] = first;
  let next = 8;
  const partyVariableRows = partyId ? first[next++] : [];
  const partyStructureRow = partyCost ? first[next++][0] : undefined;
  const defaultStructureRow = defaultCost ? first[next++][0] : undefined;

  const country = countryRows[0] ? toCountry(countryRows[0], settingsRows[0]) : null;
  if (!country) {
    throw new CatalogError(
      `El país "${countryId}" no tiene configuración de cálculo (redondeo, pernocta) en Tarifas. `
        + 'Cargala antes de liquidar.',
    );
  }
  const marginPolicy = buildMarginPolicy(marginRows[0], countryId);
  if (!marginPolicy) {
    throw new CatalogError(
      `No hay política de margen para ${country.name} en Reglas de Tarifa → Política de Margen.`,
    );
  }

  const tables = pickRateTables(rateTableRows, partyId);

  // Segunda tanda: las filas hijas de lo que apareció.
  const children: FindRequest[] = [];
  if (partyStructureRow) children.push({ entity: 'costStructureRow', options: costRowsQuery(partyStructureRow.id) });
  if (defaultStructureRow) children.push({ entity: 'costStructureRow', options: costRowsQuery(defaultStructureRow.id) });
  if (tables.length) children.push({ entity: 'rateTableRow', options: rateTableRowsQuery(tables.map((t) => t.id)) });
  const second = children.length ? await findMany(db(), children) : [];
  let child = 0;
  const partyCostRows = partyStructureRow ? second[child++] : [];
  const defaultCostRows = defaultStructureRow ? second[child++] : [];
  const tableRows = tables.length ? second[child++] : [];

  const groups = groupRows.map(toZoneGroup);
  const cost = buildCostStructure(partyStructureRow, partyCostRows);
  const defaults = buildCostStructure(defaultStructureRow, defaultCostRows);

  return {
    country,
    rules: buildRules(ofCountry, global, countryId),
    zones: buildZones(zoneRows, groups),
    zoneGroups: groups,
    marginPolicy,
    partyVariables: buildPartyVariables(partyVariableRows),
    costStructure: cost.structure,
    costStructureRows: cost.rows,
    defaultCostStructure: defaults.structure,
    defaultCostStructureRows: defaults.rows,
    rateTables: tables,
    rateTableRows: buildRateTableRows(tableRows),
  };
}
