// ¿CUÁNTO suma cada regla? Switch exhaustivo sobre los 10 operadores de Expr — sin eval, sin
// fórmulas como texto. También aloja runChargePipeline, que recorre las etapas en el orden fijo
// de STAGE_ORDER usando la lista de reglas ya resueltas por resolver.ts.
// Puerto literal de vista-tarifas-fase1/src/kernel/evaluator.ts.

import Decimal from 'decimal.js';
import type {
  BaseRef, CalculateInput, Country, Expr, FxRate, FxUsed, Money, Pred, Rule, Stage,
  TraceLine, VarBag, ZoneLaneRate,
} from './types';
import { STAGE_ORDER } from './types';
import { roundToMoney, toDecimal, ZERO } from './money';

// ── Predicados — ¿aplica esta condición? ──────────────────────────────────────────────────────

function toComparableNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

// Igualdad tolerante a tipo: 40 (number) === "40" (string) cuando ambos son numéricos.
function looseEq(a: string | number, b: string | number): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    const an = toComparableNumber(a);
    const bn = toComparableNumber(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an === bn;
  }
  return String(a) === String(b);
}

// Evaluador puro de predicados. GT/GTE/LT/LTE comparan numéricamente; si la variable de la
// izquierda no es numérica, Number(...) da NaN y la comparación resulta false (falla silenciosa:
// una regla mal escrita no aplica, no rompe el cálculo del resto).
export function evaluatePred(pred: Pred, vars: VarBag): boolean {
  switch (pred.p) {
    case 'ALWAYS':
      return true;
    case 'EQ':
      return looseEq(vars[pred.left], pred.right);
    case 'NEQ':
      return !looseEq(vars[pred.left], pred.right);
    case 'GT':
      return toComparableNumber(vars[pred.left]) > toComparableNumber(pred.right);
    case 'GTE':
      return toComparableNumber(vars[pred.left]) >= toComparableNumber(pred.right);
    case 'LT':
      return toComparableNumber(vars[pred.left]) < toComparableNumber(pred.right);
    case 'LTE':
      return toComparableNumber(vars[pred.left]) <= toComparableNumber(pred.right);
    case 'IN':
      return pred.values.some((v) => looseEq(vars[pred.left], v));
    case 'BETWEEN': {
      const n = toComparableNumber(vars[pred.left]);
      return n >= pred.from && n <= pred.to;
    }
    case 'AND':
      return pred.args.every((p) => evaluatePred(p, vars));
    case 'OR':
      return pred.args.some((p) => evaluatePred(p, vars));
    case 'NOT':
      return !evaluatePred(pred.arg, vars);
  }
}

// ── Contexto de evaluación de una expresión ───────────────────────────────────────────────────

export interface EvalContext {
  vars: VarBag;
  originZoneId: string;
  destZoneId: string;
  zoneLaneRates: ZoneLaneRate[];
  /** Subtotal (en ref) de una etapa: la final si ya se cerró, la parcial si es la etapa en curso. */
  getStageSubtotal: (stage: Stage) => Decimal;
  /** Subtotal acumulado (en ref) de todas las líneas evaluadas hasta el momento. */
  getRunningSubtotal: () => Decimal;
  /** Monto final (en ref) de una regla ya evaluada, o null si no existe o aún no se evaluó. */
  getRuleAmount: (ruleCode: string) => Decimal | null;
  warn: (message: string) => void;
}

function decimalMin(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => (v.lessThan(acc) ? v : acc));
}

function decimalMax(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => (v.greaterThan(acc) ? v : acc));
}

function resolveBase(base: BaseRef, ctx: EvalContext): Decimal {
  switch (base.of) {
    case 'STAGE_SUBTOTAL':
      return ctx.getStageSubtotal(base.stage);
    case 'RUNNING_SUBTOTAL':
      return ctx.getRunningSubtotal();
    case 'RULE': {
      const amount = ctx.getRuleAmount(base.ruleCode);
      if (amount === null) {
        ctx.warn(`La base PERCENT referencia la regla "${base.ruleCode}", que no existe o aún no se evaluó.`);
        return ZERO;
      }
      return amount;
    }
  }
}

// Evaluador puro de expresiones: misma Expr + mismo EvalContext -> mismo Decimal, siempre.
export function evaluateExpr(expr: Expr, ctx: EvalContext): Decimal {
  switch (expr.op) {
    case 'FIXED':
      return toDecimal(expr.amount);

    case 'PER_UNIT': {
      const qty = toDecimal(String(ctx.vars[expr.unit]));
      return qty.times(toDecimal(expr.rate));
    }

    case 'PER_KM':
      return toDecimal(String(ctx.vars.km)).times(toDecimal(expr.rate));

    case 'PERCENT': {
      const base = resolveBase(expr.base, ctx);
      return base.times(toDecimal(expr.pct));
    }

    case 'TIERED': {
      const qty = toDecimal(String(ctx.vars[expr.unit])).toNumber();
      const tier = expr.tiers.find((t) => t.upTo === null || qty <= t.upTo);
      if (!tier) {
        throw new Error(`TIERED sin escalón que cubra el valor ${qty} (revisar que el último tier tenga upTo: null)`);
      }
      return toDecimal(tier.amount);
    }

    case 'LOOKUP_ZONE': {
      const lane = ctx.zoneLaneRates.find(
        (r) => r.originZoneId === ctx.originZoneId && r.destZoneId === ctx.destZoneId,
      );
      if (lane) return toDecimal(lane.amount);
      ctx.warn(`Sin cobertura de zona ${ctx.vars.originZone} → ${ctx.vars.destZone}: se usó la tarifa de respaldo.`);
      return evaluateExpr(expr.fallback, ctx);
    }

    case 'MIN':
      return decimalMin(expr.args.map((a) => evaluateExpr(a, ctx)));

    case 'MAX':
      return decimalMax(expr.args.map((a) => evaluateExpr(a, ctx)));

    case 'CLAMP': {
      let value = evaluateExpr(expr.value, ctx);
      if (expr.min !== undefined) value = decimalMax([value, toDecimal(expr.min)]);
      if (expr.max !== undefined) value = decimalMin([value, toDecimal(expr.max)]);
      return value;
    }

    case 'IF':
      return evaluatePred(expr.cond, ctx.vars) ? evaluateExpr(expr.then, ctx) : evaluateExpr(expr.else, ctx);
  }
}

// ── Pipeline de cargo ──────────────────────────────────────────────────────────────────────────

function fxRateFor(country: Country, fxRates: FxRate[], quotedAt: string): FxUsed {
  if (country.localCurrency === country.refCurrency) {
    return { rate: '1', type: 'INTERNAL', source: 'Moneda local = moneda de referencia' };
  }
  const candidates = fxRates
    .filter(
      (r) => r.countryId === country.id && r.from === country.localCurrency
        && r.to === country.refCurrency && r.validFrom <= quotedAt,
    )
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
  const chosen = candidates[0];
  if (!chosen) {
    return { rate: '1', type: 'INTERNAL', source: 'Sin tasa vigente: se asumió paridad 1:1' };
  }
  return { rate: chosen.rate, type: chosen.type, source: chosen.source };
}

function toRef(amountLocal: Decimal, fx: FxUsed): Decimal {
  return amountLocal.dividedBy(toDecimal(fx.rate));
}

export interface ChargeResult {
  trace: TraceLine[];
  stageSubtotals: Record<Stage, Money>;
  totalLiquidado: Money;
  fxUsed: FxUsed;
  warnings: string[];
}

// Extrae las entradas relevantes de una regla para hacerla explicable en el desglose de la UI.
function extractInputs(rule: Rule, vars: VarBag): Record<string, string | number> {
  const expr = rule.expression;
  switch (expr.op) {
    case 'FIXED':
      return { amount: expr.amount };
    case 'PER_UNIT':
      return { [expr.unit]: vars[expr.unit], rate: expr.rate };
    case 'PER_KM':
      return { km: vars.km, rate: expr.rate };
    case 'PERCENT':
      return { pct: expr.pct, base: expr.base.of };
    case 'TIERED':
      return { [expr.unit]: vars[expr.unit] };
    case 'LOOKUP_ZONE':
      return { originZone: vars.originZone, destZone: vars.destZone };
    case 'MIN':
    case 'MAX':
    case 'CLAMP':
    case 'IF':
      return {};
  }
}

// Recorre las reglas ya resueltas (ordenadas por resolver.ts por stage y priority) y construye la
// traza completa. Cada línea conoce el subtotal acumulado hasta ese punto para que las reglas
// PERCENT posteriores puedan usarlo como base.
export function runChargePipeline(
  applied: Rule[],
  vars: VarBag,
  originZoneId: string,
  destZoneId: string,
  input: Pick<CalculateInput, 'country' | 'trip' | 'zoneLaneRates' | 'fxRates' | 'overrides'>,
): ChargeResult {
  const { country, trip, zoneLaneRates, fxRates, overrides = {} } = input;
  const fxUsed = fxRateFor(country, fxRates, trip.quotedAt);

  const stageAccum: Record<Stage, Decimal> = {
    BASE: ZERO, VARIABLE: ZERO, MODIFIER: ZERO, SURCHARGE: ZERO, ADJUSTMENT: ZERO, TAX: ZERO,
  };
  const ruleAmounts = new Map<string, Decimal>();
  let running = ZERO;
  const warnings: string[] = [];
  const trace: TraceLine[] = [];

  applied.forEach((rule, index) => {
    const ctx: EvalContext = {
      vars,
      originZoneId,
      destZoneId,
      zoneLaneRates,
      getStageSubtotal: (stage) => stageAccum[stage],
      getRunningSubtotal: () => running,
      getRuleAmount: (ruleCode) => ruleAmounts.get(ruleCode) ?? null,
      warn: (message) => warnings.push(message),
    };

    const computed = evaluateExpr(rule.expression, ctx);
    const computedRef = rule.currencyMode === 'LOCAL' ? toRef(computed, fxUsed) : computed;

    const override = overrides[rule.code];
    const final = override ? toDecimal(override.value) : computedRef;

    // running/stageAccum acumulan el Decimal exacto, sin redondear — el único punto de redondeo
    // real es roundToMoney, aplicado más abajo solo a stageSubtotals/totalLiquidado y a las líneas
    // del trace (que son puramente de presentación).
    running = running.plus(final);
    stageAccum[rule.stage] = stageAccum[rule.stage].plus(final);
    ruleAmounts.set(rule.code, final);

    const line: TraceLine = {
      seq: index + 1,
      stage: rule.stage,
      ruleId: rule.isAdhoc ? null : rule.id,
      ruleCode: rule.code,
      label: rule.name,
      inputs: extractInputs(rule, vars),
      computed: roundToMoney(computed, country),
      currency: rule.currencyMode === 'LOCAL' ? country.localCurrency : country.refCurrency,
      computedRef: roundToMoney(computedRef, country),
      final: roundToMoney(final, country),
      runningSubtotal: roundToMoney(running, country),
    };
    trace.push(override ? { ...line, override } : line);
  });

  const stageSubtotals = Object.fromEntries(
    STAGE_ORDER.map((stage) => [stage, roundToMoney(stageAccum[stage], country)]),
  ) as Record<Stage, Money>;

  return {
    trace,
    stageSubtotals,
    totalLiquidado: roundToMoney(running, country),
    fxUsed,
    warnings,
  };
}
