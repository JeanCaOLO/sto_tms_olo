// Secuencia de guardado de una regla: valida en orden, resuelve el perfil de la compañía, guarda y audita.
// Vive aparte del hook para poder probarla sin React.

import { saveRule } from '../../../../lib/tarifas/localRulesDataSource';
import { RuleSchema } from '../../../../lib/tarifas/schemas';
import { getActorRole } from '../../../../lib/tarifas/actor';
import { discardNewParty } from '../../../../lib/tarifas/partiesDataSource';
import type { Expr, Pred } from '../../../../lib/tarifas/types';
import { registrarEventoSeguro } from '../../../../lib/liquidador/auditLog';
import { buildRuleCandidate, ruleIssueMessage, saveErrorMessage, toRulePayload, type RuleCandidate } from './ruleSubmit';
import { confirmDuplicate } from './confirmDuplicate';
import {
  parseConditions, parseExpression, preconditionError, resolvePartyId, type Parsed, type SubmitContext,
} from './ruleSubmitSteps';

/** Guarda y audita. false = el usuario prefirió no guardar una regla repetida. */
async function persist(c: SubmitContext, candidate: RuleCandidate): Promise<boolean> {
  const { rule } = c;
  if (!(await confirmDuplicate(c, candidate))) return false;
  const payload = toRulePayload(candidate, c.form.formData.country_id, !!rule, rule);
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
  return true;
}

function validateCandidate(c: SubmitContext, conditions: Pred, expression: Expr, partyId: string | null): Parsed<RuleCandidate> {
  const candidate = buildRuleCandidate({
    rule: c.rule, formData: c.form.formData, tab: c.calc.tab, builder: c.calc.builder, partyId,
    conditions, expression, conditionBuilder: c.conditions.currentConditionBuilder(), description: c.effectiveDescription,
  });
  const validation = RuleSchema.safeParse(candidate);
  if (validation.success) return { value: candidate };
  return { error: ruleIssueMessage(validation.error.issues[0]) };
}

// Mientras la compañía aún no tiene perfil no hay id real: se valida con uno provisional y el verdadero se pone después.
const PROVISIONAL_PARTY_ID = 'perfil-pendiente';

export interface SubmitResult {
  /** La regla quedó guardada. */
  saved: boolean;
  /** Qué mostrarle al usuario; null si no hay nada que decir (guardó, o prefirió no guardar la repetida). */
  error: string | null;
}

/** Valida → crea el perfil de la compañía solo si hace falta → guarda. `onSaving` marca el tramo que escribe en la base. */
export async function runRuleSubmit(c: SubmitContext, onSaving: (saving: boolean) => void): Promise<SubmitResult> {
  const fail = (error: string): SubmitResult => ({ saved: false, error });
  const blocked = preconditionError(c);
  if (blocked) return fail(blocked);

  const conds = parseConditions(c);
  if ('error' in conds) return fail(conds.error);
  const expr = parseExpression(c);
  if ('error' in expr) return fail(expr.error);
  if (c.missingVars.length > 0) {
    return fail(`La regla usa variables que esta compañía no tiene declaradas: ${c.missingVars.join(', ')}.`);
  }

  // 1) Validar con lo que ya se sabe: una regla inválida no debe dejar un perfil de compañía creado de rebote.
  const { formData } = c.form;
  const provisional = formData.scope === 'PARTY' ? (formData.party_id || PROVISIONAL_PARTY_ID) : null;
  const draft = validateCandidate(c, conds.value, expr.value, provisional);
  if ('error' in draft) return fail(draft.error);

  // 2) Recién ahora se crea el perfil (si hace falta) y se arma la regla con su id real.
  const party = await resolvePartyId(c);
  if ('error' in party) return fail(party.error);
  const createdPartyId = party.value.created ? party.value.id : null;
  const checked = validateCandidate(c, conds.value, expr.value, party.value.id);
  if ('error' in checked) {
    if (createdPartyId) await discardNewParty(createdPartyId);
    return fail(checked.error);
  }

  onSaving(true);
  let result: SubmitResult = { saved: false, error: null };
  try {
    result = { saved: await persist(c, checked.value), error: null };
  } catch (error) {
    result = fail(saveErrorMessage(error));
  } finally {
    // Si la regla no quedó guardada (falló o se rechazó la repetida), el perfil recién creado se deshace.
    if (!result.saved && createdPartyId) await discardNewParty(createdPartyId);
    onSaving(false);
  }
  return result;
}
