// Filtrado, ordenamiento y stacking de reglas. Decide cuáles reglas aplican y en qué orden.

import { evaluatePred } from '../evaluator';
import type {
  CalculateInput, DiscardedRule, Rule, Stage,
} from '../types';
import { STAGE_ORDER } from '../types';
import type { DerivedContext } from './context';
import { detectTieWarnings } from './warnings';
import { evaluateConditions } from './conditions';

export { evaluatePred };

export interface ResolveResult {
  /** Reglas aplicables, en orden TOTAL y determinista. MAX groups viajan completos. */
  applied: Rule[];
  /**
   * Reglas que rigen para este viaje (alcance, vigencia y condición) ANTES de competir por etapa. Son
   * las que el liquidador podría elegir como base aunque hoy pierdan frente a otra (EXCLUSIVE).
   */
  candidates: Rule[];
  discarded: DiscardedRule[];
  warnings: string[];
}

/** Índice de la etapa en el orden oficial. */
function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

/** Las reglas de compañía ganan los empates contra las de país. */
function scopeRank(rule: Rule): number {
  return (rule.scope ?? 'COUNTRY') === 'PARTY' ? 0 : 1;
}

/**
 * Orden TOTAL: etapa → prioridad → alcance → código.
 * Garantiza determinismo sin depender del orden de la base de datos.
 */
function compareRules(a: Rule, b: Rule): number {
  const byStage = stageIndex(a.stage) - stageIndex(b.stage);
  if (byStage !== 0) return byStage;
  const byPriority = a.priority - b.priority;
  if (byPriority !== 0) return byPriority;
  const byScope = scopeRank(a) - scopeRank(b);
  if (byScope !== 0) return byScope;
  return a.code.localeCompare(b.code);
}

/**
 * ¿Rige esta regla el día del viaje?
 * Comparación lexicográfica por YYYY-MM-DD (ambos extremos inclusivos).
 * Sin fechas → rige siempre.
 */
export function isRuleInEffect(
  rule: Pick<Rule, 'effectiveFrom' | 'effectiveTo'>,
  quotedAt: string,
): boolean {
  const day = quotedAt.slice(0, 10);
  if (rule.effectiveFrom && day < rule.effectiveFrom) return false;
  if (rule.effectiveTo && day > rule.effectiveTo) return false;
  return true;
}

/** Mensaje de vigencia para descarte OUT_OF_PERIOD. */
function vigenciaDetail(rule: Rule, quotedAt: string): string {
  const day = quotedAt.slice(0, 10);
  if (rule.effectiveFrom && day < rule.effectiveFrom) {
    return `Rige desde el ${rule.effectiveFrom} y el viaje es del ${day}.`;
  }
  return `Rigió hasta el ${rule.effectiveTo} y el viaje es del ${day}.`;
}

/** Filtra y descarta reglas por vigencia. */
function filterByVigency(
  rules: Rule[],
  quotedAt: string,
  discarded: DiscardedRule[],
): Rule[] {
  return rules.filter((rule) => {
    // Una regla inactiva se descarta más abajo (INACTIVE es la explicación más útil).
    if (!rule.active || isRuleInEffect(rule, quotedAt)) return true;
    discarded.push({
      ruleCode: rule.code,
      reason: 'OUT_OF_PERIOD',
      detail: vigenciaDetail(rule, quotedAt),
    });
    return false;
  });
}

/** Aplica reglas de compañía y descarta las de país que quedan sobrescritas. */
function applyPartyOverrides(
  partyRules: Rule[],
  countryRules: Rule[],
  discarded: DiscardedRule[],
): { partyRules: Rule[], countryRulesInScope: Rule[] } {
  const overriddenCodes = new Set(partyRules.map((r) => r.code));
  for (const rule of countryRules) {
    if (overriddenCodes.has(rule.code)) {
      discarded.push({
        ruleCode: rule.code,
        reason: 'OVERRIDDEN_BY_PARTY',
        detail: 'Reemplazada por la regla propia de la compañía con el mismo código.',
      });
    }
  }
  return {
    partyRules,
    countryRulesInScope: countryRules.filter((r) => !overriddenCodes.has(r.code)),
  };
}

/** Aplica stacking dentro de una etapa. */
function applyStackingForStage(
  inStage: Rule[],
  stage: Stage,
  discarded: DiscardedRule[],
): Rule[] {
  const winners: Rule[] = [];

  const sumRules = inStage.filter((r) => r.stacking === 'SUM');
  winners.push(...sumRules);

  const exclusiveRules = inStage.filter((r) => r.stacking === 'EXCLUSIVE');
  if (exclusiveRules.length > 0) {
    const sorted = [...exclusiveRules].sort(compareRules);
    const winner = sorted[0]!;
    winners.push(winner);
    for (const loser of sorted.slice(1)) {
      discarded.push({
        ruleCode: loser.code,
        reason: 'EXCLUDED_BY_EXCLUSIVE',
        detail: loser.priority === winner.priority
          ? `Excluida por "${winner.code}", que tiene la misma prioridad pero es más específica (regla de compañía).`
          : `Excluida por "${winner.code}" (menor priority en la etapa ${stage}).`,
      });
    }
  }

  winners.push(...inStage.filter((r) => r.stacking === 'MAX'));

  return winners;
}

/** Resuelve stacking por etapa y emite reglas ganadoras. */
function resolveStacking(
  matched: Rule[],
  discarded: DiscardedRule[],
): Rule[] {
  const winners: Rule[] = [];

  for (const stage of STAGE_ORDER) {
    const inStage = matched.filter((r) => r.stage === stage);
    winners.push(...applyStackingForStage(inStage, stage, discarded));
  }

  return winners;
}

/** Filtra y ordena reglas por país/compañía, vigencia, condiciones y stacking. */
export function resolveRules(
  input: Pick<
    CalculateInput,
    'trip' | 'country' | 'rules' | 'adhocRules' | 'zones' | 'zoneGroups' | 'locations'
  >,
  derived: DerivedContext,
): ResolveResult {
  const allRules = [...input.rules, ...(input.adhocRules ?? [])].filter(
    (r) => r.countryId === input.trip.countryId,
  );

  const discarded: DiscardedRule[] = [];
  const isPartyScoped = (r: Rule) => (r.scope ?? 'COUNTRY') === 'PARTY';
  const partyId = input.trip.partyId ?? null;

  // Filtrar por vigencia ANTES de sobrescritura.
  const partyRulesRaw = filterByVigency(
    allRules.filter((r) => isPartyScoped(r) && partyId !== null && r.partyId === partyId),
    input.trip.quotedAt,
    discarded,
  );

  const countryRulesRaw = filterByVigency(
    allRules.filter((r) => !isPartyScoped(r)),
    input.trip.quotedAt,
    discarded,
  );

  // Aplicar sobrescrituras de compañía.
  const { partyRules, countryRulesInScope } = applyPartyOverrides(partyRulesRaw, countryRulesRaw, discarded);

  const inScope = [...countryRulesInScope, ...partyRules];

  // Evaluar condiciones.
  const matched = evaluateConditions(inScope, derived.vars, discarded);

  // Resolver stacking.
  const winners = resolveStacking(matched, discarded);

  // Detectar empates de prioridad.
  const warnings = detectTieWarnings(winners);

  const applied = winners.sort(compareRules);

  return { applied, candidates: [...matched].sort(compareRules), discarded, warnings };
}
