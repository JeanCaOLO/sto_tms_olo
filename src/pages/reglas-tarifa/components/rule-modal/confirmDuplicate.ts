// Aviso de regla repetida: si ya hay otra regla activa igual y vigente a la vez, se pide confirmación.

import { listRules } from '../../../../lib/tarifas/localRulesDataSource';
import { confirmAction } from '../../../../lib/confirm';
import { toRulePayload, type RuleCandidate } from './ruleSubmit';
import { findOverlappingRule, findSimilarRule } from './ruleOverlap';
import type { SubmitContext } from './ruleSubmitSteps';

/** Avisa (sin bloquear) si ya hay otra regla activa igual y vigente a la vez. true = seguir guardando. */
export async function confirmDuplicate(c: SubmitContext, candidate: RuleCandidate): Promise<boolean> {
  const payload = toRulePayload(candidate, c.form.formData.country_id, !!c.rule);
  const existing = await listRules(c.organizationId);
  const ownId = c.rule?.id as string | undefined;
  const clash = findOverlappingRule(payload, existing, ownId);
  const similar = clash ? null : findSimilarRule(payload, existing, ownId);
  if (!clash && !similar) return true;
  return confirmAction({
    title: 'Regla repetida',
    message: clash
      ? `Ya hay una regla activa con el código ${payload.code} y el mismo alcance cuya vigencia coincide `
        + `("${String(clash.name)}"). Con las dos activas, las dos se evalúan. ¿Guardar de todos modos?`
      : similar?.kind === 'MISMA_LOGICA'
        ? `La regla ${String(similar.rule.code)} ("${String(similar.rule.name)}") ya hace lo mismo: misma fase, condición y `
          + 'fórmula en el mismo alcance. Con las dos activas el cargo se cobra dos veces. ¿Guardar de todos modos?'
        : `Ya hay una regla con el mismo nombre y otro código (${String(similar?.rule.code)}): en pantalla no se podrán `
          + 'distinguir. ¿Guardar de todos modos?',
    confirmLabel: 'Guardar',
    variant: 'primary',
  });
}
