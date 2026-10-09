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
import { evaluatePred, RuleShapeError } from './evaluator';
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
  TENDERING: { label: 'Tendering', hint: 'Se asigna por licitación' },
};

export const BASE_METHOD_ORDER: readonly BaseMethodId[] = ['PER_KM', 'PER_UNIT', 'FIXED', 'VOLUME', 'TENDERING'];

const NO_DATA = 'No hay información para este cálculo.';
const TENDERING_PENDING = 'Todavía no tiene un cálculo definido.';

export interface BaseMethodOption extends BaseMethodMeta {
  id: BaseMethodId;
  available: boolean;
  /** Por qué está bloqueado. Es el texto del hover. */
  reason?: string;
  /** De dónde saldría la base si se elige. */
  source?: BaseSource;
}

/** Qué cobra una expresión: el tipo de cobro al que pertenece y el concepto (para detectar duplicados). */
export interface ExprKind {
  method: BaseMethodId;
  /** Concepto cobrado: 'km', 'volume', 'unit:<variable>' o 'fixed'. */
  concept: string;
  /** Si el monto sale de un tarifario, su código. */
  table?: string;
}

function kindOfUnit(unit: string): ExprKind {
  if (unit === 'km') return { method: 'PER_KM', concept: 'km' };
  if (unit === 'truckVolumeM3') return { method: 'VOLUME', concept: 'volume' };
  return { method: 'PER_UNIT', concept: `unit:${unit}` };
}

/** Clasifica una expresión. Null = no es un cobro "por algo" (porcentajes, expresiones mixtas). */
export function classifyExpr(expr: Expr): ExprKind | null {
  switch (expr.op) {
    case 'FIXED':
      return { method: 'FIXED', concept: 'fixed' };
    case 'PER_KM':
      return { method: 'PER_KM', concept: 'km' };
    case 'PER_UNIT':
    case 'TIERED':
    case 'PER_BLOCK':
      return kindOfUnit(expr.unit);
    case 'LOOKUP_TABLE':
      // Un tarifario por zona/camión da un importe por viaje: es la tarifa fija de siempre.
      return { method: 'FIXED', concept: 'fixed', table: expr.table };
    case 'CLAMP':
      return classifyExpr(expr.value);
    case 'MIN':
    case 'MAX':
      return expr.args[0] ? classifyExpr(expr.args[0]) : null;
    case 'IF':
      return classifyExpr(expr.then);
    default:
      return null;
  }
}

/** Costo por km que ya dice la estructura de costos de la flota propia, con la estructura de la que sale. */
export interface StructureKmCost {
  structure: CostStructure;
  perKm: Decimal;
}

const hasRows = (s: CostStructure | null | undefined, rows: CostStructureRow[] | undefined) =>
  !!s?.active && !!rows?.length;

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
  const structure = hasRows(input.costStructure, input.costStructureRows)
    ? input.costStructure!
    : hasRows(input.defaultCostStructure, input.defaultCostStructureRows)
      ? input.defaultCostStructure!
      : null;
  if (!structure) return null;
  const rows = (structure === input.costStructure ? input.costStructureRows : input.defaultCostStructureRows) ?? [];

  const { kmPerYear, fuelPrice, fuelEfficiency } = structure.params;
  let perKm = new Decimal(0);

  for (const row of rows) {
    if (!row.active) continue;
    if (row.truckType && row.truckType !== input.trip.truckTypeId) continue;
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
    } else if (row.driver === 'PER_MONTH_PRORATED' && kmPerYear && kmPerYear > 0) {
      rate = toDecimal(row.amount).times(12).dividedBy(kmPerYear);
    }
    if (!rate) continue;
    perKm = row.sign === 'SUBTRACT' ? perKm.minus(rate) : perKm.plus(rate);
  }

  const efficiency = input.trip.truckTypeId ? fuelEfficiency[input.trip.truckTypeId] : undefined;
  if (fuelPrice && efficiency && toDecimal(efficiency).greaterThan(0)) {
    perKm = perKm.plus(toDecimal(fuelPrice).dividedBy(toDecimal(efficiency)));
  }

  return perKm.greaterThan(0) ? { structure, perKm } : null;
}

function sourceOfRule(rule: Rule, kind: ExprKind): BaseSource {
  return kind.table
    ? { kind: 'RATE_TABLE', ref: kind.table, label: `Tarifario ${kind.table}` }
    : { kind: 'RULE', ref: rule.code, label: `Regla ${rule.name || rule.code}` };
}

/** Reglas BASE ya resueltas (alcance, vigencia y condición) que pertenecen a un tipo de cobro. */
function baseRulesOf(applied: Rule[], method: BaseMethodId): { rule: Rule; kind: ExprKind }[] {
  return applied
    .filter((r) => r.stage === 'BASE')
    .flatMap((rule) => {
      const kind = classifyExpr(rule.expression);
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

const STAGES: readonly string[] = ['BASE', 'VARIABLE', 'MODIFIER', 'SURCHARGE', 'ADJUSTMENT', 'TAX'];

/** Mismo orden que el resolver: etapa, prioridad, alcance (la de compañía primero) y código. */
function compareRulesForBase(a: Rule, b: Rule): number {
  const byStage = STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage);
  if (byStage !== 0) return byStage;
  if (a.priority !== b.priority) return a.priority - b.priority;
  const rank = (r: Rule) => ((r.scope ?? 'COUNTRY') === 'PARTY' ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return a.code.localeCompare(b.code);
}

/**
 * Reglas BASE que quedan al elegir un tipo de cobro: todas las que se suman o compiten por MAX y,
 * entre las EXCLUSIVE, solo la de mayor precedencia (igual que haría el resolver).
 */
function pickBaseRules(candidates: Rule[], method: BaseMethodId): { rule: Rule; kind: ExprKind }[] {
  const all = baseRulesOf(candidates, method);
  const exclusive = all.filter((c) => c.rule.stacking === 'EXCLUSIVE')
    .sort((a, b) => compareRulesForBase(a.rule, b.rule));
  return [...all.filter((c) => c.rule.stacking !== 'EXCLUSIVE'), ...exclusive.slice(0, 1)];
}

export interface AppliedBase {
  /** Reglas que quedan para el pipeline. */
  rules: Rule[];
  /** Línea base sembrada (sustituye a los gastos de la estructura de costos). */
  seed: TraceLine[];
  discarded: DiscardedRule[];
  warnings: string[];
  issues: CalcIssue[];
  base?: BaseInfo;
}

/**
 * Reemplaza la base por el tipo de cobro elegido.
 *
 * - Fuente regla/tarifario: quedan solo las reglas BASE de ese tipo; las demás reglas BASE y los
 *   gastos de la estructura de costos dejan de aplicar.
 * - Fuente estructura de costos (km): la base es km × costo por km de la estructura; todas las reglas
 *   BASE dejan de aplicar.
 * - Las reglas de OTRAS fases que cobran el mismo concepto (p. ej. por km cuando la base ya es por
 *   km) se omiten, y se informa cuáles, para no cobrar dos veces.
 *
 * Si el tipo elegido no tiene información, no se toca nada y se devuelve un problema bloqueante: la
 * liquidación no puede emitirse con una base que no se pudo resolver.
 */
export function applyBaseOverride(
  input: Pick<
    CalculateInput,
    'trip' | 'country' | 'costStructure' | 'costStructureRows' | 'defaultCostStructure' | 'defaultCostStructureRows'
  >,
  override: BaseOverride,
  applied: Rule[],
  candidates: Rule[],
  currentSeed: TraceLine[],
  vars?: VarBag,
): AppliedBase {
  const option = describeBaseMethods(input, candidates, vars).find((o) => o.id === override.method);
  if (!option?.available || !option.source) {
    const label = BASE_METHODS[override.method]?.label ?? override.method;
    return {
      rules: applied,
      seed: currentSeed,
      discarded: [],
      warnings: [],
      issues: [{
        code: 'BASE_NO_DISPONIBLE',
        message: `No se puede calcular la base "${label}": ${option?.reason ?? NO_DATA} `
          + 'Elegí otro tipo de cobro o volvé a la base por defecto.',
      }],
    };
  }

  const source = option.source;
  const chosen = source.kind === 'COST_STRUCTURE' ? [] : pickBaseRules(candidates, override.method);
  const chosenIds = new Set(chosen.map((c) => c.rule.id));
  const concept = chosen[0]?.kind.concept ?? 'km';

  const discarded: DiscardedRule[] = [];
  const replaced: string[] = [];
  const duplicates: { ruleCode: string; detail: string }[] = [];
  // Las reglas BASE elegidas pueden ser de las que hoy perdían por exclusividad: se toman de los
  // candidatos, no de las ganadoras. Las de las demás etapas siguen siendo las ganadoras de siempre.
  const kept: Rule[] = chosen.map((c) => c.rule);

  for (const rule of applied) {
    if (rule.stage === 'BASE') {
      if (chosenIds.has(rule.id)) continue;
      replaced.push(rule.code);
      discarded.push({
        ruleCode: rule.code,
        reason: 'BASE_REEMPLAZADA',
        detail: `La base se calcula "${option.label.toLowerCase()}": esta regla ya no aplica a la base.`,
      });
      continue;
    }
    const kind = classifyExpr(rule.expression);
    if (kind && kind.concept !== 'fixed' && kind.concept === concept) {
      const detail = `La base ya cobra ${option.label.toLowerCase()}: se omitió para no cobrar dos veces lo mismo.`;
      duplicates.push({ ruleCode: rule.code, detail });
      discarded.push({ ruleCode: rule.code, reason: 'DUPLICA_BASE', detail });
      continue;
    }
    kept.push(rule);
  }

  const warnings: string[] = [];
  let seed: TraceLine[] = [];

  // Las BASE que eran candidatas pero ni siquiera aplicaban (perdían por exclusividad) no estaban en
  // la base: no hace falta contarlas como reemplazadas.
  if (currentSeed.length > 0) replaced.push('ESTRUCTURA_COSTOS');

  if (source.kind === 'COST_STRUCTURE') {
    const structureKm = structureCostPerKm(input, vars);
    // Misma fuente que `describeBaseMethods` acaba de validar: no debería faltar.
    if (structureKm) {
      const km = toDecimal(input.trip.km);
      const amount = roundToMoney(km.times(structureKm.perKm), input.country);
      seed = [{
        seq: 1,
        stage: 'BASE',
        ruleId: null,
        ruleCode: 'BASE_KM_ESTRUCTURA',
        label: 'Base por kilómetro (estructura de costos)',
        inputs: { km: input.trip.km, 'costo por km': structureKm.perKm.toFixed(4) },
        source: 'COST_ROW',
        computed: amount,
        final: amount,
        runningSubtotal: amount,
      }];
    }
  }

  if (duplicates.length > 0) {
    warnings.push(
      `Se omitieron ${duplicates.length} regla(s) que cobraban lo mismo que la base `
      + `(${duplicates.map((d) => d.ruleCode).join(', ')}).`,
    );
  }

  return {
    rules: kept.sort(compareRulesForBase),
    seed,
    discarded,
    warnings,
    issues: [],
    base: { method: override.method, source, replaced, duplicates },
  };
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
