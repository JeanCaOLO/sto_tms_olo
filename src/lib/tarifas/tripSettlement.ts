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

import { calculate } from './index';
import { CatalogError, loadTarifasCatalog, type TarifasCatalog } from './catalogLoader';
import { buildCustomVarFields, missingDeclaredVars, type CustomVarField } from './customVarFields';
import { getProfileForCarrier } from './partiesDataSource';
import { buildCalculateInput } from './settlementInput';
import { emptyTripEdits, notLiquidableReason, toTripContext } from './tripContext';
import { getTrip } from './tripsDataSource';
import type { CalcIssue, CalcResult, CalculateInput, Override, Rule, TripContext, TripEdits, TripRecord } from './types';

export interface TripCalculation {
  trip: TripRecord;
  /** Perfil de cálculo del transportista, o null si no tiene (se liquida con las reglas del país). */
  partyId: string | null;
  /** Campos a dibujar para lo variable: las variables PER_TRIP activas del perfil. */
  customVarFields: CustomVarField[];
  /** Variables `custom:*` que alguna regla usa y el perfil no declaró (valen 0). */
  undeclaredVars: string[];
  context: TripContext;
  input: CalculateInput;
  result: CalcResult;
  /** Problemas del armado + del motor que impiden emitir. */
  blockingIssues: CalcIssue[];
  /** Avisos del armado + del motor. */
  warnings: string[];
  /** Si el viaje no se puede liquidar (no completado, ya liquidado…), por qué. Null = se puede. */
  notLiquidableReason: string | null;
}

export type TripCalculationResult =
  | { status: 'ok'; calculation: TripCalculation }
  /** Falta configuración del país (costos, margen, redondeo): no hay cálculo posible. */
  | { status: 'catalog-error'; message: string }
  | { status: 'not-found'; message: string };

export interface CalculateTripOptions {
  overrides?: Record<string, Override>;
  adhocRules?: Rule[];
  /** Para re-liquidar: se ignora que el viaje ya tenga una liquidación vigente. */
  allowSettled?: boolean;
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

  const profile = trip.carrierId ? await getProfileForCarrier(trip.carrierId) : null;
  const partyId = profile && profile.status !== 'inactive' ? profile.id : null;

  let catalog: TarifasCatalog;
  try {
    catalog = await loadTarifasCatalog(trip.countryId, partyId);
  } catch (error) {
    if (error instanceof CatalogError) return { status: 'catalog-error', message: error.message };
    throw error;
  }

  const context = toTripContext(trip, edits, partyId);
  const { input, issues, warnings } = buildCalculateInput(catalog, context, {
    ...(options.overrides ? { overrides: options.overrides } : {}),
    ...(options.adhocRules ? { adhocRules: options.adhocRules } : {}),
  });

  // Con un problema de armado (p.ej. zona inexistente) el motor no puede correr: se devuelve un
  // resultado vacío con el problema a la vista, en vez de una excepción.
  let result: CalcResult;
  try {
    result = issues.length > 0 ? emptyResult(catalog, issues) : calculate(input);
  } catch (error) {
    // Falta una configuración que el motor exige (p. ej. la tarifa plana de un tercero): se informa
    // como falta de catálogo en vez de romper la pantalla con una excepción.
    return { status: 'catalog-error', message: error instanceof Error ? error.message : String(error) };
  }

  const reason = notLiquidableReason(trip);
  const ignorable = options.allowSettled && trip.settlementId && trip.status === 'completed';

  return {
    status: 'ok',
    calculation: {
      trip,
      partyId,
      customVarFields: buildCustomVarFields(catalog.partyVariables),
      undeclaredVars: missingDeclaredVars(referencedVarKeys(rulesForParty(catalog, partyId)), catalog.partyVariables),
      context,
      input,
      result,
      blockingIssues: [...issues, ...(issues.length > 0 ? [] : result.blockingIssues)],
      warnings: [...warnings, ...result.warnings],
      notLiquidableReason: ignorable ? null : reason,
    },
  };
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
    margin: { amount: '0', pct: '0', status: 'OK', action: 'NONE', currency },
    warnings: [],
    blockingIssues: issues,
  };
}
