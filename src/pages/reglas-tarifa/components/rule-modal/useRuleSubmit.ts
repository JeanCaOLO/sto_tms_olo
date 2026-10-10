// Envío del modal de reglas: valida en orden, resuelve el perfil de la compañía, guarda y audita.

import { useState, type FormEvent } from 'react';
import { saveRule } from '../../../../lib/tarifas/localRulesDataSource';
import { RuleSchema } from '../../../../lib/tarifas/schemas';
import { getActorRole } from '../../../../lib/tarifas/actor';
import type { Expr, Pred } from '../../../../lib/tarifas/types';
import { registrarEventoSeguro } from '../../../../lib/liquidador/auditLog';
import { buildRuleCandidate, saveErrorMessage, toRulePayload, type RuleCandidate } from './ruleSubmit';
import {
  parseConditions, parseExpression, preconditionError, resolvePartyId, type Parsed, type SubmitContext,
} from './ruleSubmitSteps';

async function persist(c: SubmitContext, candidate: RuleCandidate) {
  const { rule } = c;
  const payload = toRulePayload(candidate, c.form.formData.country_id, !!rule);
  const { error } = await saveRule(c.organizationId, payload, rule?.id as string | undefined);
  if (error) throw error;
  await registrarEventoSeguro({
    entidad: 'pricing_rules',
    entidadId: (rule?.id as string | undefined) || candidate.code,
    accion: rule ? 'UPDATE' : 'CREATE',
    usuario: c.usuarioActivo,
    rol: getActorRole(),
    antes: rule ?? null,
    despues: payload,
    motivo: candidate.reason ?? undefined,
  });
}

function validateCandidate(c: SubmitContext, conditions: Pred, expression: Expr, partyId: string | null): Parsed<RuleCandidate> {
  const candidate = buildRuleCandidate({
    rule: c.rule, formData: c.form.formData, tab: c.calc.tab, builder: c.calc.builder, partyId,
    conditions, expression, conditionBuilder: c.conditions.currentConditionBuilder(), description: c.effectiveDescription,
  });
  const validation = RuleSchema.safeParse(candidate);
  if (validation.success) return { value: candidate };
  const first = validation.error.issues[0];
  return { error: `Regla inválida: ${first?.path.join('.')} — ${first?.message}` };
}

export function useRuleSubmit(c: SubmitContext) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg('');
    const blocked = preconditionError(c);
    if (blocked) { setErrorMsg(blocked); return; }

    const conds = parseConditions(c);
    if ('error' in conds) { setErrorMsg(conds.error); return; }
    const expr = parseExpression(c);
    if ('error' in expr) { setErrorMsg(expr.error); return; }
    if (c.missingVars.length > 0) {
      setErrorMsg(`La regla usa variables que esta compañía no tiene declaradas: ${c.missingVars.join(', ')}.`);
      return;
    }
    const party = await resolvePartyId(c);
    if ('error' in party) { setErrorMsg(party.error); return; }

    const checked = validateCandidate(c, conds.value, expr.value, party.value);
    if ('error' in checked) { setErrorMsg(checked.error); return; }

    setLoading(true);
    try {
      await persist(c, checked.value);
      c.onSuccess();
      c.onClose();
    } catch (error) {
      setErrorMsg(saveErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return { handleSubmit, loading, errorMsg, setErrorMsg };
}
