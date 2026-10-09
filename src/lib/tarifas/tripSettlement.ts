// El camino ÚNICO de "viaje de guía de despacho → total liquidado".
//
// Lo usan la pantalla de liquidación y el Probador en modo "desde un viaje": los dos piden el
// cálculo acá, así que no pueden volver a divergir (que es el defecto que más veces apareció en el
// módulo, ROADMAP §4.11). Junta las piezas en este orden:
//
//   viaje (db)  →  perfil del transportista (db)  →  catálogo del país + perfil (db)
//               →  contexto del motor (tripContext, puro)  →  entrada (settlementInput, puro)
//               →  calculate (kernel, puro)
//
// Todo lo que se lee pasa por la capa de datos; lo que se calcula no lee nada.

import { calculate, listBaseMethods, type BaseMethodOption } from './index';
import { CatalogError, loadTarifasCatalog, type TarifasCatalog } from './catalogLoader';
import { buildCustomVarFields, missingDeclaredVars, type CustomVarField } from './customVarFields';
import { getProfileForCarrierCached } from './partiesDataSource';
import { detectMissingLogic, noLogicMessage, noRuleApplied, type NoLogicInfo } from './missingLogic';
import { buildCalculateInput } from './settlementInput';
import { emptyTripEdits, notLiquidableReason, toTripContext } from './tripContext';
import { getTrip, listTripOrders } from './tripsDataSource';
import { cargoFromOrders } from './tripOrders';
import type {
  BaseOverride, CalcIssue, CalcResult, CalculateInput, CargoSummary, Override, Rule, TripContext, TripEdits, TripOrder,
  TripRecord,
} from './types';

export interface TripCalculation {
  trip: TripRecord;
  /** Pedidos del viaje (una guía = un pedido) con su marca. Vacío si no se pudieron leer. */
  orders: TripOrder[];
  /** Perfil de cálculo del transportista, o null si no tiene (se liquida con las reglas del país). */
  partyId: string | null;
  /** Campos a dibujar para lo variable: las variables PER_TRIP activas del perfil. */
  customVarFields: CustomVarField[];
  /** Variables `custom:*` que alguna regla usa y el perfil no declaró (valen 0). */
  undeclaredVars: string[];
  context: TripContext;
  input: CalculateInput;
  result: CalcResult;
  /** Tipos de cobro que puede tomar la base de este viaje, con su fuente o el motivo del bloqueo. */
  baseMethods: BaseMethodOption[];
  /** Problemas del armado + del motor que impiden emitir. */
  blockingIssues: CalcIssue[];
  /** Avisos del armado + del motor. */
  warnings: string[];
  /** Si el viaje no se puede liquidar (no completado, ya liquidado…), por qué. Null = se puede. */
  notLiquidableReason: string | null;
}

export type TripCalculationResult =
  | { status: 'ok'; calculation: TripCalculation }
  /**
   * Falta configuración del país (costos, margen, redondeo) o de la compañía: no hay cálculo posible.
   * `noLogic` viene cuando lo que falta es la lógica de costos de la flota del viaje: la pantalla
   * ofrece el enlace para cargarla.
   */
  | { status: 'catalog-error'; message: string; noLogic?: NoLogicInfo }
  | { status: 'not-found'; message: string };

export interface CalculateTripOptions {
  overrides?: Record<string, Override>;
  adhocRules?: Rule[];
  /** Tipo de cobro que reemplaza a la base por defecto. Sin él se calcula como siempre. */
  baseOverride?: BaseOverride | null;
  /** Para re-liquidar: se ignora que el viaje ya tenga una liquidación vigente. */
  allowSettled?: boolean;
  /**
   * Salta las cachés del catálogo y del perfil y lee todo de nuevo. Es lo que se usa justo antes de
   * emitir: navegar puede usar datos de hasta unos minutos, pagar no.
   */
  fresh?: boolean;
}

/** Claves de variables que nombran las reglas, a cualquier profundidad de condición/expresión. */
function referencedVarKeys(rules: Rule[]): string[] {
  const keys: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      if (node.startsWith('custom:')) keys.push(node);
      return;
    }
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  for (const rule of rules) {
    walk(rule.conditions);
    walk(rule.expression);
  }
  return keys;
}

/** Reglas que pueden aplicarle a este perfil: las del país y las suyas. */
function rulesForParty(catalog: TarifasCatalog, partyId: string | null): Rule[] {
  return catalog.rules.filter((r) => (r.scope ?? 'COUNTRY') !== 'PARTY' || r.partyId === partyId);
}

/**
 * Calcula la liquidación de un viaje con lo cargado a mano (`edits`). No escribe nada: el
 * resultado se emite después con `emitSettlement` / `reliquidateSettlement`.
 */
export async function calculateTrip(
  tripOrId: string | TripRecord,
  edits: TripEdits = emptyTripEdits(),
  options: CalculateTripOptions = {},
): Promise<TripCalculationResult> {
  const trip = typeof tripOrId === 'string' ? await getTrip(tripOrId) : tripOrId;
  if (!trip) return { status: 'not-found', message: 'El viaje no existe.' };

  // Los pedidos del viaje no dependen del perfil ni del catálogo: se piden a la vez para no sumar sus
  // idas y vueltas a las del perfil y el catálogo (cada una cuesta lo mismo que cualquier otra).
  const ordersRequest = listTripOrders(trip.id).then(
    (rows) => ({ rows, failure: null as unknown }),
    (failure: unknown) => ({ rows: [] as TripOrder[], failure }),
  );

  const profile = trip.carrierId ? await getProfileForCarrierCached(trip.carrierId, { fresh: options.fresh }) : null;
  const partyId = profile && profile.status !== 'inactive' ? profile.id : null;

  let catalog: TarifasCatalog;
  try {
    catalog = await loadTarifasCatalog(trip.countryId, partyId, { fresh: options.fresh });
  } catch (error) {
    if (error instanceof CatalogError) return { status: 'catalog-error', message: error.message };
    throw error;
  }

  // Sin lógica de costos para la flota del viaje no hay total que inventar: se dice qué falta.
  const missing = detectMissingLogic(catalog, trip, partyId);
  if (missing) return { status: 'catalog-error', message: noLogicMessage(missing), noLogic: missing };

  const context = toTripContext(trip, edits, partyId);
  // La mercancía solo alimenta la auditoría y el reparto por casa: si no se puede leer, lo que se paga
  // NO cambia. Se avisa en vez de frenar la liquidación.
  const { rows: orders, failure } = await ordersRequest;
  const cargo: CargoSummary | null = failure ? null : cargoFromOrders(orders);
  const cargoWarning: string | null = failure
    ? 'No se pudo leer la mercancía del viaje (pedidos de sus guías): no habrá ganancia/pérdida de '
      + `auditoría ni reparto por casa comercial. ${failure instanceof Error ? failure.message : ''}`.trim()
    : null;
  const { input, issues, warnings } = buildCalculateInput(catalog, context, {
    ...(cargo ? { cargo } : {}),
    ...(options.overrides ? { overrides: options.overrides } : {}),
    ...(options.adhocRules ? { adhocRules: options.adhocRules } : {}),
    ...(options.baseOverride ? { baseOverride: options.baseOverride } : {}),
  });

  // Con un problema de armado (p.ej. zona inexistente) el motor no puede correr: se devuelve un
  // resultado vacío con el problema a la vista, en vez de una excepción.
  let result: CalcResult;
  try {
    result = issues.length > 0 ? emptyResult(catalog, issues) : calculate(input);
  } catch (error) {
    // Falta una configuración que el motor exige (p. ej. la estructura de costos de la flota
    // propia): se informa como falta de catálogo en vez de romper la pantalla con una excepción.
    return { status: 'catalog-error', message: error instanceof Error ? error.message : String(error) };
  }

  // Un tercero con reglas en el catálogo pero ninguna aplicada a este viaje terminaría en cero.
  if (issues.length === 0 && result.blockingIssues.length === 0) {
    const none = noRuleApplied(trip, partyId, result.trace.length);
    if (none) return { status: 'catalog-error', message: noLogicMessage(none), noLogic: none };
  }

  const reason = notLiquidableReason(trip);
  const ignorable = options.allowSettled && trip.settlementId && trip.status === 'completed';

  return {
    status: 'ok',
    calculation: {
      trip,
      orders,
      partyId,
      customVarFields: buildCustomVarFields(catalog.partyVariables),
      undeclaredVars: missingDeclaredVars(referencedVarKeys(rulesForParty(catalog, partyId)), catalog.partyVariables),
      context,
      input,
      result,
      baseMethods: issues.length > 0 ? [] : listBaseMethods(input),
      blockingIssues: [...issues, ...(issues.length > 0 ? [] : result.blockingIssues)],
      warnings: [...warnings, ...(cargoWarning ? [cargoWarning] : []), ...result.warnings],
      notLiquidableReason: ignorable ? null : reason,
    },
  };
}

/**
 * Huella de lo que se pagaría: total, líneas del cálculo (regla, versión y monto final), problemas
 * bloqueantes, perfil y marca de cada pedido. Dos cálculos con la misma huella pagan lo mismo.
 */
export function calculationSignature(c: TripCalculation): string {
  return JSON.stringify({
    partyId: c.partyId,
    total: c.result.totalLiquidado,
    currency: c.result.currency,
    cost: c.result.cost.total,
    margin: c.result.margin.status,
    trace: c.result.trace.map((l) => [l.ruleId, l.ruleVersion ?? null, l.final]),
    base: c.result.base ? [c.result.base.method, c.result.base.source.ref] : null,
    blocking: c.blockingIssues.map((i) => i.code),
    orders: c.orders.map((o) => [o.guideId, o.mark]),
  });
}

export type FreshCheck =
  | { status: 'same' }
  | { status: 'changed'; calculation: TripCalculation }
  | { status: 'failed'; message: string };

/**
 * Vuelve a calcular SIN cachés lo mismo que la persona tiene en pantalla y dice si el resultado cambió.
 * Contra la API las cachés del catálogo y del perfil duran minutos; si otra persona cambió una tarifa
 * en ese rato, emitir con el cálculo de la pantalla pagaría un valor viejo.
 */
export async function recheckBeforeEmit(
  shown: TripCalculation,
  edits: TripEdits,
  options: CalculateTripOptions = {},
): Promise<FreshCheck> {
  const res = await calculateTrip(shown.trip, edits, { ...options, fresh: true });
  if (res.status !== 'ok') return { status: 'failed', message: res.message };
  return calculationSignature(res.calculation) === calculationSignature(shown)
    ? { status: 'same' }
    : { status: 'changed', calculation: res.calculation };
}

/**
 * Calienta el perfil y el catálogo del transportista de un viaje, para que abrir su liquidación no
 * pague esa espera (la primera vez por transportista es lo más lento de abrir el modal). Se pide
 * cuando la persona muestra intención —pasa el cursor o enfoca "Liquidar"— y no al cargar la lista,
 * para no disparar el catálogo de todos los transportistas a la vez. Nunca lanza: si falla, el
 * cálculo real lo vuelve a intentar y muestra el error de verdad.
 */
export async function prefetchTripCatalog(trip: Pick<TripRecord, 'carrierId' | 'countryId'>): Promise<void> {
  try {
    const profile = trip.carrierId ? await getProfileForCarrierCached(trip.carrierId) : null;
    const partyId = profile && profile.status !== 'inactive' ? profile.id : null;
    await loadTarifasCatalog(trip.countryId, partyId);
  } catch {
    // Solo es una ayuda: sin ella todo sigue funcionando.
  }
}

function emptyResult(catalog: TarifasCatalog, issues: CalcIssue[]): CalcResult {
  const currency = catalog.country.localCurrency;
  return {
    trace: [],
    discarded: [],
    stageSubtotals: { BASE: '0', VARIABLE: '0', MODIFIER: '0', SURCHARGE: '0', ADJUSTMENT: '0', TAX: '0' },
    totalLiquidado: '0',
    currency,
    cost: { total: '0', breakdown: [], modelId: 'NONE', currency },
    margin: {
      amount: '0', pct: '0', status: 'OK', basis: 'NONE', cargoValue: '0', expense: '0', currency,
    },
    allocation: null,
    warnings: [],
    blockingIssues: issues,
  };
}
