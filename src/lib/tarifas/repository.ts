// Capa de mapeo TMS real + datos locales de tarifas -> CalculateInput. A diferencia del resto de
// `src/lib/tarifas/`, este archivo SÍ importa Supabase y SÍ puede usar `new Date()` — vive fuera
// del kernel puro a propósito.
//
// Habla con DOS fuentes distintas, sin relación de FK entre sí:
// - `supabase` (proyecto real del TMS): rutas, tiendas, tipos de ruta, vehículos — datos reales de
//   la operación. Countries acá NO tiene columnas de tarifación (moneda de referencia, redondeo,
//   etc.) — nunca las tuvo, son de otro dominio. NO SE TOCA.
// - `localData/store.ts` (JSON + localStorage): countries/zones/zone_groups/zone_lane_rates/
//   fx_rates/pricing_rules/own_cost_params/outsourced_cost_rates/margin_policies — todo lo que el
//   motor de tarifas necesita, mientras no hay acceso a una base de datos real para este módulo.
//
// `resolveLiquidadorCountry()` es el puente entre ambas: un viaje real pertenece a un país real
// (`countries.code`/`iso_code` del TMS); para tarifarlo hace falta encontrar el país EQUIVALENTE
// en los datos de tarifas (por código ISO2). Si nadie cargó todavía ese país en Tarifas, se usa
// como resguardo el único país que exista ahí (útil mientras solo hay un país de prueba
// configurado) y se devuelve un aviso explicando por qué, para que no quede como magia silenciosa.
//
// Contiene también el truco central de la Fase 1: el prototipo original resuelve zona vía un
// catálogo `Location` (originLocationId/destLocationId -> Location.zoneId). Este proyecto no tiene
// una tabla de Location real —ni siquiera columnas `zone_id` en `stores`/`route_types` del TMS real
// todavía—, así que acá se construye un array `Location[]` SINTÉTICO en memoria. Hoy siempre queda
// vacío (sin `zone_id` no hay nada que sintetizar), lo cual es correcto: las reglas condicionadas
// por zona simplemente no matchean (con aviso), pero el resto del motor (fleetType, montos fijos,
// por km, por unidad, etc.) funciona igual. El día que `stores`/`route_types` reales tengan
// `zone_id`, esto empieza a resolver zonas sin tocar el kernel.

import { supabase } from '../supabase';
import { loadDatabase } from './localData/store';
import type {
  CalculateInput, Country, FxRate, Location, MarginPolicy, OutsourcedCostRate, OwnCostParams,
  Rule, TripContext, Zone, ZoneGroup, ZoneLaneRate,
} from './types';

interface RouteRow {
  id: string;
  route_type_id: string | null;
  store_id: string | null;
  carrier_id: string | null;
  driver_id: string | null;
  total_distance: number | null;
  total_weight: number | null;
  total_stops: number | null;
}

interface SettlementFormData {
  total_deliveries: number;
  settlement_date: string; // 'YYYY-MM-DD'
}

function mapRuleRow(row: Record<string, unknown>, fallbackCountryId: string): Rule {
  return {
    id: row.id as string,
    // `country_id` nullable en la tabla = regla global, aplica a cualquier país configurado en
    // Tarifas. resolver.ts filtra por countryId exacto, así que acá se "estampa" el país (de
    // Tarifas, no el país real del viaje) del país actual en vez de dejarlo vacío.
    countryId: (row.country_id as string | null) ?? fallbackCountryId,
    code: row.code as string,
    name: row.name as string,
    stage: row.stage as Rule['stage'],
    priority: row.priority as number,
    stacking: row.stacking as Rule['stacking'],
    exclusionGroup: (row.exclusion_group as string | null) ?? null,
    currencyMode: row.currency_mode as Rule['currencyMode'],
    conditions: row.conditions as Rule['conditions'],
    expression: row.expression as Rule['expression'],
    isAdhoc: row.is_adhoc as boolean,
    active: row.active as boolean,
    version: row.version as number,
  };
}

function mapLiquidadorCountryRow(row: Record<string, unknown>): Country {
  return {
    id: row.id as string,
    iso2: row.iso2 as string,
    name: row.name as string,
    localCurrency: row.local_currency as string,
    refCurrency: row.ref_currency as string,
    roundingDecimals: row.rounding_decimals as number,
    roundingMode: row.rounding_mode as Country['roundingMode'],
    overnightThresholdHours: row.overnight_threshold_hours as number,
  };
}

// ---------------------------------------------------------------------------------------------
// Puente TMS real -> datos de tarifas, por código de país (ISO2/código corto). Ver comentario de
// cabecera.
// ---------------------------------------------------------------------------------------------

async function resolveLiquidadorCountry(realCountryId: string): Promise<{ country: Country; warning: string | null }> {
  const { data: realCountry, error: realError } = await supabase
    .from('countries')
    .select('code, iso_code, name')
    .eq('id', realCountryId)
    .maybeSingle();
  if (realError) throw realError;

  const candidateCodes = [realCountry?.code, realCountry?.iso_code].filter((v): v is string => !!v);

  const db = loadDatabase();

  if (candidateCodes.length > 0) {
    const matched = db.countries.find((c) => candidateCodes.includes(c.iso2));
    if (matched) return { country: mapLiquidadorCountryRow(matched), warning: null };
  }

  const realCountryLabel = realCountry?.name ?? realCountryId;
  const codesLabel = candidateCodes.join('/') || 'sin código';

  if (db.countries.length === 0) {
    throw new Error('No hay ningún país configurado en Tarifas → Reglas de Tarifa todavía. Creá al menos uno antes de liquidar.');
  }
  if (db.countries.length > 1) {
    throw new Error(
      `No se encontró en Tarifas un país con el mismo código que "${realCountryLabel}" (código: ${codesLabel}). ` +
      `Hay ${db.countries.length} países configurados en Tarifas — agregá uno con ese código o revisá cuál corresponde.`,
    );
  }

  const fallback = mapLiquidadorCountryRow(db.countries[0]!);
  return {
    country: fallback,
    warning: `Se usó "${fallback.name}" (único país configurado en Tarifas) porque ningún país de Tarifas tiene el ` +
      `código de "${realCountryLabel}" (${codesLabel}). Cargá un país con ese código en Tarifas → Reglas de Tarifa cuando corresponda.`,
  };
}

// ---------------------------------------------------------------------------------------------
// Todo lo de acá para abajo (reglas/zonas/tasas/costos/margen) lee de `localData/store.ts`, no de
// Supabase — ver comentario de cabecera.
// ---------------------------------------------------------------------------------------------

function fetchActivePricingRules(liquidadorCountryId: string): Rule[] {
  const db = loadDatabase();
  return db.pricingRules
    .filter((r) => r.active && (r.country_id === liquidadorCountryId || !r.country_id))
    .map((row) => mapRuleRow(row, liquidadorCountryId));
}

function fetchZones(): Zone[] {
  return loadDatabase().zones.map((row) => ({
    id: row.id, countryId: row.country_id ?? '', zoneGroupId: row.zone_group_id ?? null,
    code: row.code, name: row.name,
  }));
}

function fetchZoneGroups(): ZoneGroup[] {
  return loadDatabase().zoneGroups.map((row) => ({
    id: row.id, countryId: row.country_id ?? '', code: row.code, name: row.name,
  }));
}

function fetchZoneLaneRates(liquidadorCountryId: string): ZoneLaneRate[] {
  return loadDatabase().zoneLaneRates
    .filter((r) => r.country_id === liquidadorCountryId && r.status === 'active')
    .map((row) => ({
      id: row.id, countryId: liquidadorCountryId, originZoneId: row.origin_zone_id,
      destZoneId: row.dest_zone_id, amount: String(row.amount),
    }));
}

function fetchFxRates(liquidadorCountryId: string): FxRate[] {
  return loadDatabase().fxRates
    .filter((r) => r.country_id === liquidadorCountryId)
    .map((row) => ({
      id: row.id, countryId: row.country_id, from: row.from_currency, to: row.to_currency,
      rate: String(row.rate), type: row.rate_type, source: row.source ?? '', validFrom: row.valid_from,
    }));
}

function fetchOwnCostParams(liquidadorCountryId: string): OwnCostParams {
  const row = loadDatabase().ownCostParams.find((p) => p.country_id === liquidadorCountryId);
  if (!row) {
    throw new Error(
      'No hay parámetros de costo propio configurados para este país en Tarifas → Reglas de ' +
      'Tarifa → Costos. Configúralos antes de liquidar.',
    );
  }
  return {
    id: row.id, countryId: liquidadorCountryId, costPerKm: String(row.cost_per_km),
    depreciationPerKm: String(row.depreciation_per_km), driverDaily: String(row.driver_daily),
  };
}

function fetchOutsourcedCostRates(liquidadorCountryId: string): OutsourcedCostRate[] {
  return loadDatabase().outsourcedCostRates
    .filter((r) => r.country_id === liquidadorCountryId)
    .map((row) => ({
      id: row.id, countryId: liquidadorCountryId, carrierId: row.carrier_id,
      truckTypeId: row.truck_type_id, flatRate: String(row.flat_rate),
    }));
}

function fetchMarginPolicy(liquidadorCountryId: string): MarginPolicy {
  const row = loadDatabase().marginPolicies.find((p) => p.country_id === liquidadorCountryId);
  if (!row) {
    throw new Error(
      'No hay política de margen configurada para este país en Tarifas → Reglas de Tarifa → ' +
      'Política de Margen. Configúrala antes de liquidar.',
    );
  }
  return {
    countryId: liquidadorCountryId, warnBelow: Number(row.warn_below), criticalBelow: Number(row.critical_below),
    requireReasonBelow: Number(row.require_reason_below), blockOnLoss: !!row.block_on_loss,
  };
}

// Una entrada por store (zona origen) y una por route_type (zona destino) — ver comentario de
// cabecera. deriveContext() (resolver.ts) exige que la Location EXISTA para el id del viaje (falla
// fuerte si no, a propósito: es la señal de un dato realmente roto) — por eso acá SIEMPRE se crea
// una entrada, nunca se filtra por si tiene zona o no. Hoy `stores`/`route_types` del TMS real no
// tienen `zone_id`, así que se usa `fallbackZoneId` (la zona "catch-all" SIN_ZONA de los datos de
// tarifas — ver `resolveFallbackZoneId`): el viaje resuelve una zona real y válida, solo que
// genérica, así que las reglas condicionadas por zona real simplemente no matchean (el resto del
// motor funciona igual). El día que `stores`/`route_types` reales tengan `zone_id`, esto empieza a
// resolver zonas de verdad sin tocar el kernel.
export function buildSyntheticLocations(
  stores: { id: string; country_id: string; zone_id: string | null }[],
  routeTypes: { id: string; zone_id: string | null }[],
  liquidadorCountryId: string,
  fallbackZoneId: string,
): Location[] {
  const storeLocations: Location[] = stores
    .map((s) => ({ id: s.id, countryId: liquidadorCountryId, zoneId: s.zone_id ?? fallbackZoneId, code: s.id, name: s.id }));

  const routeTypeLocations: Location[] = routeTypes
    .map((rt) => ({ id: rt.id, countryId: liquidadorCountryId, zoneId: rt.zone_id ?? fallbackZoneId, code: rt.id, name: rt.id }));

  return [...storeLocations, ...routeTypeLocations];
}

const FALLBACK_ZONE_CODE = 'SIN_ZONA';

function resolveFallbackZoneId(liquidadorCountryId: string): string {
  const zone = loadDatabase().zones.find(
    (z) => z.country_id === liquidadorCountryId && z.code === FALLBACK_ZONE_CODE,
  );
  if (!zone) {
    throw new Error(
      `Falta la zona catch-all "${FALLBACK_ZONE_CODE}" para este país en Tarifas. Creá una zona con ese código ` +
      'exacto en Tarifas → Reglas de Tarifa → Zonas — la usan los viajes reales, que todavía no tienen zona propia asignada.',
    );
  }
  return zone.id;
}

// Mapeo TripContext <- esquema real de este proyecto. Son simplificaciones conscientes de la
// Fase 1 (ver docs/superpowers/specs/2026-08-31-motor-tarifas-design.md sección 7 y el plan de
// Fase 1): una ruta no tiene un único cliente ni un tipo de servicio hoy, así que esos campos
// quedan fijos hasta que exista un dato real que los alimente. `countryId` es el país RESUELTO en
// los datos de tarifas (ver `resolveLiquidadorCountry`), no el país real del viaje.
export function buildTripContext(
  route: RouteRow,
  vehicleType: string | null,
  settlement: SettlementFormData,
  liquidadorCountryId: string,
): TripContext {
  return {
    countryId: liquidadorCountryId,
    quotedAt: new Date(settlement.settlement_date).toISOString(),
    originLocationId: route.store_id ?? '',
    destLocationId: route.route_type_id ?? '',
    km: route.total_distance ?? 0,
    clientCount: route.total_stops ?? 0,
    packageCount: settlement.total_deliveries ?? 0,
    weightKg: route.total_weight ?? 0,
    truckTypeId: vehicleType ?? '',
    serviceType: 'STANDARD',
    // `fleetType` es una variable DERIVADA (igual que originZone/destZone) para que las reglas
    // puedan condicionar por ella — NO selecciona un modelo de cálculo distinto en código: la
    // bifurcación nómina/cuentas-por-pagar la deciden las reglas de `pricing_rules` (condicionadas
    // por `fleetType`/`carrierId`), nunca un `if` de este archivo.
    fleetType: route.carrier_id ? 'OUTSOURCED' : 'OWN',
    carrierId: route.carrier_id,
    driverId: route.driver_id,
    customerId: null,
    durationHours: 0,
    tollsAmount: '0',
    lateMinutes: 0,
    incidentCount: 0,
  };
}

export interface CalculateInputDeps {
  countryId: string; // id de `countries` del TMS real (país de la tienda de origen)
  route: RouteRow;
  vehicleType: string | null;
  settlement: SettlementFormData;
  stores: { id: string; country_id: string; zone_id: string | null }[];
  routeTypes: { id: string; zone_id: string | null }[];
}

export interface ToCalculateInputResult {
  input: CalculateInput;
  /** Aviso a mostrar al usuario si se usó un país de resguardo — ver `resolveLiquidadorCountry`. */
  warning: string | null;
}

export async function toCalculateInput(deps: CalculateInputDeps): Promise<ToCalculateInputResult> {
  const { country, warning } = await resolveLiquidadorCountry(deps.countryId);

  const rules = fetchActivePricingRules(country.id);
  const zones = fetchZones();
  const zoneGroups = fetchZoneGroups();
  const zoneLaneRates = fetchZoneLaneRates(country.id);
  const fxRates = fetchFxRates(country.id);
  const ownCostParams = fetchOwnCostParams(country.id);
  const outsourcedCostRates = fetchOutsourcedCostRates(country.id);
  const marginPolicy = fetchMarginPolicy(country.id);
  const fallbackZoneId = resolveFallbackZoneId(country.id);

  // Además de las locations sintéticas por store/route_type (que siempre resuelven a la zona
  // catch-all SIN_ZONA), se agrega una location "auto-mapeada" por cada zona real configurada en
  // Tarifas → Reglas de Tarifa → Zonas: permite usar el id de una zona directamente como
  // originLocationId/destLocationId (ver SettlementModal, selects "Zona origen"/"Zona destino") y
  // que el motor la resuelva a esa zona real — sin esto, ninguna regla condicionada por
  // originZone/destZone podía matchear nunca para un viaje real.
  const zoneLocations: Location[] = zones
    .filter((z) => z.countryId === country.id)
    .map((z) => ({ id: z.id, countryId: country.id, zoneId: z.id, code: z.code, name: z.name }));
  const locations = [
    ...buildSyntheticLocations(deps.stores, deps.routeTypes, country.id, fallbackZoneId),
    ...zoneLocations,
  ];
  const trip = buildTripContext(deps.route, deps.vehicleType, deps.settlement, country.id);

  return {
    input: {
      country, trip, rules, zones, zoneGroups, locations, zoneLaneRates, fxRates,
      ownCostParams, outsourcedCostRates, marginPolicy,
    },
    warning,
  };
}
