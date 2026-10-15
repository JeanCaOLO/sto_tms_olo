// Armado puro de lo que se guarda al enviar el modal de reglas: la candidata a validar y el payload.

import { classifyExpr } from '../../../../lib/tarifas/baseMethods';
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
    // Solo los ajustes se ligan a una forma de cobro: la BASE es la que la define.
    // La forma de cobro de una BASE se deduce de su fórmula: así declarada y fórmula nunca se contradicen.
    baseMethod: formData.stage === 'BASE' ? classifyExpr(input.expression)?.method ?? null : null,
    appliesToBase: formData.stage !== 'BASE' && formData.applies_to_base.length > 0 ? formData.applies_to_base : null,
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

/**
 * La fila que va a la base (snake_case); una edición sube la versión. Solo lleva columnas de
 * `tarifas_pricing_rules`: el backend rechaza con 400 cualquier campo que la tabla no tenga (por eso no
 * hay `updated_at`; la fecha del cambio queda en la bitácora).
 */
export function toRulePayload(
  candidate: RuleCandidate, countryId: string, isEdit: boolean, previous?: Record<string, unknown>,
) {
  // Columnas de sql/38: solo viajan con valor (o si la regla ya las tenía y ahora se limpian). Así guardar
  // una regla sigue funcionando contra un backend cuyo manifest todavía no las conoce.
  const optional = (key: 'applies_to_base' | 'base_method', value: unknown) =>
    value != null || previous?.[key] != null ? { [key]: value ?? null } : {};
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
    ...optional('applies_to_base', candidate.appliesToBase),
    ...optional('base_method', candidate.baseMethod),
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
  };
}

/** Mensaje para el usuario cuando falla el guardado. */
export function saveErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  return msg.includes('duplicate') || msg.includes('unique')
    ? 'Ya existe una regla con ese código.'
    : `Error al guardar la regla: ${msg}`;
}
