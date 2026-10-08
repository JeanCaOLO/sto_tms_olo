// Pasos de validación del envío del modal de reglas, en el orden en que se le muestran al usuario.

import { ensurePartyProfile } from '../../../../lib/tarifas/partiesDataSource';
import {
  compileBuilder, isBuilderValid, validateBuilder, validateConditionRows,
} from '../../../../lib/tarifas/rule-builder';
import type { Expr, Pred } from '../../../../lib/tarifas/types';
import type { useRuleForm } from './useRuleForm';
import type { useRuleConditions } from './useRuleConditions';
import type { useRuleBuilder } from './useRuleBuilder';

export interface SubmitContext {
  rule: Record<string, unknown> | undefined;
  organizationId: string;
  usuarioActivo: string;
  allowed: boolean;
  form: ReturnType<typeof useRuleForm>;
  conditions: ReturnType<typeof useRuleConditions>;
  calc: ReturnType<typeof useRuleBuilder>;
  selectedCarrierId: string;
  missingVars: string[];
  effectiveDescription: string;
  onSuccess: () => void;
  onClose: () => void;
}

export type Parsed<T> = { value: T } | { error: string };

/** Chequeos previos al armado. Devuelve el mensaje del primero que falla, o null. */
export function preconditionError(c: SubmitContext): string | null {
  const { formData } = c.form;
  if (!c.organizationId) return 'No se pudo identificar la organización. Recarga la página e intenta de nuevo.';
  if (!c.allowed) return `Tu rol no puede ${c.rule ? 'editar' : 'crear'} reglas.`;
  if (formData.scope === 'PARTY' && !c.selectedCarrierId) {
    return 'Elegí a qué compañía pertenece la regla, o cambiá su alcance a "Todas las compañías del país".';
  }
  if (formData.stacking === 'MAX' && !formData.exclusion_group.trim()) {
    return 'Cuando el modo es "Compite: gana la de monto más alto", es obligatorio definir el grupo de exclusión.';
  }
  const { conditions } = c;
  if (conditions.conditionMode === 'rows') {
    const rowErrors = validateConditionRows({
      mode: conditions.conditionMode, combinator: conditions.conditionCombinator, rows: conditions.conditionRows,
    });
    conditions.setConditionRowErrors(rowErrors);
    if (Object.keys(rowErrors).length > 0) return 'Revisá las filas de condición marcadas.';
  }
  return null;
}

export function parseConditions(c: SubmitContext): Parsed<Pred> {
  try {
    return { value: c.conditions.buildConditions() };
  } catch {
    return { error: 'La condición en modo avanzado no es JSON válido.' };
  }
}

export function parseExpression({ calc }: SubmitContext): Parsed<Expr> {
  if (calc.tab === 'simple') {
    const errors = validateBuilder(calc.builder);
    calc.setBuilderErrors(errors);
    return isBuilderValid(errors)
      ? { value: compileBuilder(calc.builder) }
      : { error: 'Revisá los campos marcados del cálculo.' };
  }
  try {
    return { value: JSON.parse(calc.advancedExpressionJson) as Expr };
  } catch {
    return { error: 'La expresión en modo avanzado no es JSON válido.' };
  }
}

/** Id del perfil de cálculo de la compañía; lo crea si todavía no existe. */
export async function resolvePartyId(c: SubmitContext): Promise<Parsed<string | null>> {
  const { formData } = c.form;
  if (formData.scope !== 'PARTY') return { value: null };
  if (formData.party_id) return { value: formData.party_id };
  const ensured = await ensurePartyProfile(c.selectedCarrierId);
  if (ensured.status === 'failed') {
    return { error: `No se pudo crear el perfil de cálculo de la compañía: ${ensured.error.message}` };
  }
  return { value: ensured.partyId };
}
