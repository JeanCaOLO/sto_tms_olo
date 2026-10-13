// Aviso de regla repetida: si ya hay otra regla activa igual y vigente a la vez, se pide confirmación.

import { listRules } from '../../../../lib/tarifas/localRulesDataSource';
import { confirmAction } from '../../../../lib/confirm';
import { toRulePayload, type RuleCandidate } from './ruleSubmit';
import { findOverlappingRule } from './ruleOverlap';
import type { SubmitContext } from './ruleSubmitSteps';

/** Avisa (sin bloquear) si ya hay otra regla activa igual y vigente a la vez. true = seguir guardando. */
export async function confirmDuplicate(c: SubmitContext, candidate: RuleCandidate): Promise<boolean> {
  const payload = toRulePayload(candidate, c.form.formData.country_id, !!c.rule);
  const clash = findOverlappingRule(payload, await listRules(c.organizationId), c.rule?.id as string | undefined);
  if (!clash) return true;
  return confirmAction({
    title: 'Regla repetida',
    message: `Ya hay una regla activa con el código ${payload.code} y el mismo alcance cuya vigencia coincide `
      + `("${String(clash.name)}"). Con las dos activas, las dos se evalúan. ¿Guardar de todos modos?`,
    confirmLabel: 'Guardar',
    variant: 'primary',
  });
}
