// Armado puro de lo que se guarda al enviar el modal de reglas: la candidata a validar y el payload.

import type {
  ConditionBuilderForm, Expr, Pred, RuleBuilderForm,
} from '../../../../lib/tarifas/types';
import type { RuleFormData } from './useRuleForm';

interface CandidateInput {
  rule: Record<string, unknown> | undefined;
  formData: RuleFormData;
  tab: 'simple' | 'advanced';
  builder: RuleBuilderForm;
  partyId: string | null;
  conditions: Pred;
  expression: Expr;
  conditionBuilder: ConditionBuilderForm | null;
  description: string;
}

/** La regla tal como la valida `RuleSchema` (camelCase), antes de guardarla. */
export function buildRuleCandidate(input: CandidateInput) {
  const { rule, formData, tab, builder } = input;
  const exclusionGroup = formData.exclusion_group.trim();
  return {
    id: rule?.id || 'draft',
    countryId: formData.country_id || 'draft',
    scope: formData.scope,
    partyId: input.partyId,
    code: formData.code.trim().toUpperCase(),
    name: formData.name,
    stage: formData.stage,
    priority: Number(formData.priority),
    stacking: formData.stacking,
    exclusionGroup: formData.stacking === 'MAX' && exclusionGroup ? exclusionGroup : null,
    conditions: input.conditions,
    expression: input.expression,
    description: input.description || null,
    reason: formData.reason.trim() || null,
    effect: tab === 'simple' ? builder.effect : null,
    builder: tab === 'simple' ? builder : null,
    conditionBuilder: input.conditionBuilder,
    isAdhoc: false,
    active: formData.active,
    effectiveFrom: formData.effective_from || null,
    effectiveTo: formData.effective_to || null,
    version: (rule?.version as number | undefined) ?? 1,
  };
}

export type RuleCandidate = ReturnType<typeof buildRuleCandidate>;

/** La fila que va a la base (snake_case); una edición sube la versión. */
export function toRulePayload(candidate: RuleCandidate, countryId: string, isEdit: boolean) {
  return {
    country_id: countryId || null,
    scope: candidate.scope,
    party_id: candidate.partyId,
    code: candidate.code,
    name: candidate.name,
    stage: candidate.stage,
    priority: candidate.priority,
    stacking: candidate.stacking,
    exclusion_group: candidate.exclusionGroup,
    conditions: candidate.conditions,
    expression: candidate.expression,
    description: candidate.description,
    reason: candidate.reason,
    effect: candidate.effect,
    builder: candidate.builder,
    condition_builder: candidate.conditionBuilder,
    is_adhoc: false,
    active: candidate.active,
    effective_from: candidate.effectiveFrom,
    effective_to: candidate.effectiveTo,
    version: isEdit ? candidate.version + 1 : 1,
    updated_at: new Date().toISOString(),
  };
}

/** Mensaje para el usuario cuando falla el guardado. */
export function saveErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  return msg.includes('duplicate') || msg.includes('unique')
    ? 'Ya existe una regla con ese código.'
    : `Error al guardar la regla: ${msg}`;
}
