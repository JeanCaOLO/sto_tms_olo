// Cambio de base de cálculo. Dice QUÉ tipos de cobro puede tomar la fase BASE de un viaje con la
// información que ya está cargada (reglas, tarifarios, estructura de costos) y, si el liquidador
// eligió uno, reemplaza la base y evita que otra fase cobre lo mismo dos veces.
//
// Es lógica pura, igual que el resto del kernel: recibe todo por parámetro y no lee nada del entorno.
// No hay un "tipo de cobro" propio del motor: cada uno equivale a una familia de operadores de `Expr`
// (km = PER_KM, unidad = PER_UNIT sobre una variable que no es km ni volumen, fija = FIXED o un
// tarifario por zona, volumen = operadores sobre el volumen del camión). Así elegir un tipo de cobro
// es elegir QUÉ reglas BASE aplican, sin inventar un segundo lenguaje de cálculo.

import Decimal from 'decimal.js';
import { componentCostPerKm } from './cost';
import { fuelEfficiencyFor, pickStructure, rowAppliesToTruck } from './cost/shared';
import { evaluatePred, RuleShapeError } from './evaluator';
import { classifyExpr, type ExprKind } from './exprKind';
import { roundToMoney, toDecimal } from './money';
import type {
  BaseInfo, BaseMethodId, BaseOverride, BaseSource, CalcIssue, CalculateInput, CostStructure,
  CostStructureRow, DiscardedRule, Expr, Rule, TraceLine, VarBag,
} from './types';

export interface BaseMethodMeta {
  label: string;
  /** Una línea, con palabras clave: qué se cobra con este tipo de cobro. */
  hint: string;
}

export const BASE_METHODS: Record<BaseMethodId, BaseMethodMeta> = {
  PER_KM: { label: 'Por kilómetro', hint: 'Km del viaje × costo por km' },
  PER_UNIT: { label: 'Por unidad', hint: 'Paradas, peso u horas × valor por unidad' },
  FIXED: { label: 'Tarifa fija', hint: 'Un monto por viaje o por zona' },
  VOLUME: { label: 'Por volumen', hint: 'Volumen del camión × valor' },
  TENDERING: { label: 'Tendering', hint: 'Monto adjudicado al viaje por licitación' },
};

export const BASE_METHOD_ORDER: readonly BaseMethodId[] = ['PER_KM', 'PER_UNIT', 'FIXED', 'VOLUME', 'TENDERING'];

export { classifyExpr, type ExprKind };

export const NO_DATA = 'No hay información para este cálculo.';
// Tendering no se elige como base de un viaje ni sale de reglas: el monto es el adjudicado a ESE viaje.
const TENDERING_PENDING = 'Se calcula con el monto adjudicado al viaje (no sale de reglas ni se elige como base).';

export interface BaseMethodOption extends BaseMethodMeta {
  id: BaseMethodId;
  available: boolean;
  /** Por qué está bloqueado. Es el texto del hover. */
  reason?: string;
  /** De dónde saldría la base si se elige. */
  source?: BaseSource;
}

/** Costo por km que ya dice la estructura de costos de la flota propia, con la estructura de la que sale. */
export interface StructureKmCost {
  structure: CostStructure;
  perKm: Decimal;
}

/**
 * Costo por km de la estructura de costos (la de la compañía; si no tiene, la del país).
 *
 * Suma lo que la estructura ya expresa por km: filas por km, componentes con frecuencia (llantas,
 * mantenimiento), importes mensuales amortizados con los km por año y el combustible (precio ÷
 * rendimiento). Lo demás (fijo por viaje, por día, por parada) no es por km y no entra.
 */
export function structureCostPerKm(
  input: Pick<
    CalculateInput,
    'trip' | 'costStructure' | 'costStructureRows' | 'defaultCostStructure' | 'defaultCostStructureRows'
  >,
  vars?: VarBag,
): StructureKmCost | null {
  if (input.trip.fleetType !== 'OWN') return null;
  const picked = pickStructure(input);
  if (!picked) return null;
  const { structure, rows } = picked;

  const { kmPerYear, fuelPrice, fuelEfficiency } = structure.params;
  let perKm = new Decimal(0);
  const tripKm = toDecimal(input.trip.km ?? 0);
  const nights = Number(vars?.overnightNights ?? 0);
  const tripDays = (Number.isFinite(nights) && nights > 0 ? nights : 0) + 1;

  for (const row of rows) {
    if (!row.active) continue;
    if (!rowAppliesToTruck(row, input.trip.truckTypeId)) continue;
    if (row.appliesWhen && vars) {
      try {
        if (!evaluatePred(row.appliesWhen, vars)) continue;
      } catch (e) {
        if (e instanceof RuleShapeError) continue;
        throw e;
      }
    }
    let rate: Decimal | null = null;
    if (row.frequency) {
      rate = componentCostPerKm(row, kmPerYear);
    } else if (row.driver === 'PER_KM') {
      rate = toDecimal(row.amount);
    } else if (row.driver === 'PER_MONTH_PRORATED' && tripKm.greaterThan(0) && structure.operatingDaysPerMonth > 0) {
      // Misma definición que el costo del viaje (`unitsForDriver`): el mensual se prorratea por día
      // operativo y por la duración del viaje; acá se expresa por km del MISMO viaje, así la base por
      // km y el costo de la estructura coinciden.
      rate = toDecimal(row.amount).times(tripDays).dividedBy(structure.operatingDaysPerMonth).dividedBy(tripKm);
    }
    if (!rate) continue;
    perKm = row.sign === 'SUBTRACT' ? perKm.minus(rate) : perKm.plus(rate);
  }

  const efficiency = fuelEfficiencyFor(fuelEfficiency, input.trip.truckTypeId);
  if (fuelPrice && efficiency && toDecimal(efficiency).greaterThan(0)) {
    perKm = perKm.plus(toDecimal(fuelPrice).dividedBy(toDecimal(efficiency)));
  }

  return perKm.greaterThan(0) ? { structure, perKm } : null;
}

export function sourceOfRule(rule: Rule, kind: ExprKind): BaseSource {
  return kind.table
    ? { kind: 'RATE_TABLE', ref: kind.table, label: `Tarifario ${kind.table}` }
    : { kind: 'RULE', ref: rule.code, label: `Regla ${rule.name || rule.code}` };
}

const CONCEPT_OF_METHOD: Record<BaseMethodId, string> = {
  PER_KM: 'km', PER_UNIT: 'unit', FIXED: 'fixed', VOLUME: 'volume', TENDERING: 'tendering',
};

/**
 * Forma de cobro de una regla BASE: la que declara (`baseMethod`) y, en filas anteriores a ese campo,
 * la que se deduce de su expresión. El concepto cobrado siempre sale de la expresión cuando se puede leer.
 */
export function baseKindOf(rule: Rule): ExprKind | null {
  const kind = classifyExpr(rule.expression);
  if (!rule.baseMethod) return kind;
  return kind?.method === rule.baseMethod ? kind : { method: rule.baseMethod, concept: CONCEPT_OF_METHOD[rule.baseMethod] };
}

/** Aviso (no bloquea) cuando la forma de cobro declarada no coincide con lo que la expresión cobra. */
export function baseMethodMismatch(rule: Rule): string | null {
  if (rule.stage !== 'BASE' || !rule.baseMethod) return null;
  const kind = classifyExpr(rule.expression);
  if (kind?.method === rule.baseMethod) return null;
  const declared = BASE_METHODS[rule.baseMethod].label;
  return kind
    ? `Declara base "${declared}" pero su fórmula cobra "${BASE_METHODS[kind.method].label}".`
    : `Declara base "${declared}" pero su fórmula no se puede clasificar.`;
}

/** Reglas BASE ya resueltas (alcance, vigencia y condición) que pertenecen a un tipo de cobro. */
export function baseRulesOf(applied: Rule[], method: BaseMethodId): { rule: Rule; kind: ExprKind }[] {
  return applied
    .filter((r) => r.stage === 'BASE')
    .flatMap((rule) => {
      const kind = baseKindOf(rule);
      return kind && kind.method === method ? [{ rule, kind }] : [];
    });
}

/**
 * Los tipos de cobro disponibles para este viaje. `candidates` son las reglas que rigen para él
 * (alcance, vigencia, condición) aunque hoy pierdan contra otra por exclusividad: una regla BASE que
 * no rige para este viaje no es información para calcularlo.
 */
export function describeBaseMethods(
  input: Pick<
    CalculateInput,
    'trip' | 'costStructure' | 'costStructureRows' | 'defaultCostStructure' | 'defaultCostStructureRows'
  >,
  candidates: Rule[],
  vars?: VarBag,
): BaseMethodOption[] {
  const structureKm = structureCostPerKm(input, vars);

  return BASE_METHOD_ORDER.map((id): BaseMethodOption => {
    const meta = BASE_METHODS[id];
    if (id === 'TENDERING') return { id, ...meta, available: false, reason: TENDERING_PENDING };

    const fromRule = baseRulesOf(candidates, id)[0];
    if (fromRule) {
      return { id, ...meta, available: true, source: sourceOfRule(fromRule.rule, fromRule.kind) };
    }
    if (id === 'PER_KM' && structureKm) {
      return {
        id,
        ...meta,
        available: true,
        source: {
          kind: 'COST_STRUCTURE',
          ref: structureKm.structure.id,
          label: 'Estructura de costos de la compañía',
        },
      };
    }
    return { id, ...meta, available: false, reason: NO_DATA };
  });
}

/** Cómo arrancar una regla BASE nueva de cada tipo de cobro (lo que el formulario de reglas precarga). */
export const BASE_RULE_TEMPLATES: Record<
  Exclude<BaseMethodId, 'TENDERING'>,
  { operator: 'TIMES' | 'FIXED'; variable: 'km' | 'clientCount' | 'truckVolumeM3' | null }
> = {
  PER_KM: { operator: 'TIMES', variable: 'km' },
  PER_UNIT: { operator: 'TIMES', variable: 'clientCount' },
  FIXED: { operator: 'FIXED', variable: null },
  VOLUME: { operator: 'TIMES', variable: 'truckVolumeM3' },
};

/** "Este cálculo está basado en…" — la frase con la que se explica de dónde sale la base. */
export function sourceSentence(source: BaseSource): string {
  switch (source.kind) {
    case 'COST_STRUCTURE':
      return 'Este cálculo está basado en la estructura de costos de la compañía.';
    case 'RATE_TABLE':
      return `Este cálculo está basado en el tarifario ${source.ref}.`;
    case 'TENDER':
      return 'Este cálculo está basado en el monto adjudicado al viaje por tendering.';
    default:
      return `Este cálculo está basado en la ${source.label.charAt(0).toLowerCase()}${source.label.slice(1)}.`;
  }
}

/** De dónde sale la base de un cálculo YA hecho (con o sin cambio de base). */
export function describeCurrentBase(
  result: { trace: TraceLine[]; base?: BaseInfo },
): { label: string; changed: boolean } {
  if (result.base) return { label: result.base.source.label, changed: true };
  const lines = result.trace.filter((l) => l.stage === 'BASE');
  if (lines.length === 0) return { label: 'Sin base', changed: false };
  if (lines.some((l) => l.source === 'COST_ROW')) {
    return { label: 'Estructura de costos de la compañía', changed: false };
  }
  const first = lines[0]!;
  if (first.tableMatch) return { label: `Tarifario ${first.tableMatch.tableCode}`, changed: false };
  return { label: `Regla ${first.label || first.ruleCode}`, changed: false };
}
