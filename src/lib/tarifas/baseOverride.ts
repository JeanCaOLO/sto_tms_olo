// Aplicación del cambio de base de cálculo: reemplaza la fase BASE por el tipo de cobro elegido y
// evita que otra fase cobre lo mismo dos veces. Lógica pura, como el resto del kernel.

import Decimal from 'decimal.js';
import { evaluatePred, RuleShapeError } from './evaluator';
import { roundToMoney, toDecimal } from './money';
import {
  BASE_METHODS, NO_DATA, baseRulesOf, classifyExpr, describeBaseMethods, sourceOfRule, structureCostPerKm,
  type ExprKind,
} from './baseMethods';
import type {
  BaseInfo, BaseMethodId, BaseOverride, BaseSource, CalcIssue, CalculateInput, DiscardedRule, Rule, TraceLine, VarBag,
} from './types';

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
