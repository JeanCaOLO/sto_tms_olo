// Evaluación de condiciones de reglas contra variables.

import { evaluatePred, RuleShapeError } from '../evaluator';
import type { DiscardedRule, Rule, VarBag } from '../types';

/** Evalúa condiciones y filtra reglas que se cumplen. */
export function evaluateConditions(
  rules: Rule[],
  vars: VarBag,
  discarded: DiscardedRule[],
): Rule[] {
  const matched: Rule[] = [];

  for (const rule of rules) {
    if (!rule.active) {
      discarded.push({ ruleCode: rule.code, reason: 'INACTIVE', detail: 'La regla está inactiva.' });
      continue;
    }
    let aplica: boolean;
    try {
      aplica = evaluatePred(rule.conditions, vars);
    } catch (e) {
      if (!(e instanceof RuleShapeError)) throw e;
      discarded.push({
        ruleCode: rule.code,
        reason: 'RULE_BROKEN',
        detail: `No se pudo leer su condición: ${e.message}. Revisala en modo avanzado.`,
      });
      continue;
    }
    if (!aplica) {
      discarded.push({
        ruleCode: rule.code,
        reason: 'CONDITION_FALSE',
        detail: 'La condición de la regla no se cumplió con el contexto actual.',
      });
      continue;
    }
    matched.push(rule);
  }

  return matched;
}
