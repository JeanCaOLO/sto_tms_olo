// Datos de identificación, vigencia y apilado de la regla (lo que no es condición ni cálculo).

import { useEffect, useState } from 'react';
import type { BuilderOperator, NumericVarKey, Stage } from '../../../../lib/tarifas/types';

export interface RuleFormData {
  code: string;
  name: string;
  country_id: string;
  stage: Stage;
  priority: number;
  stacking: 'SUM' | 'MAX' | 'EXCLUSIVE';
  exclusion_group: string;
  scope: 'COUNTRY' | 'PARTY';
  party_id: string;
  reason: string;
  active: boolean;
  effective_from: string;
  effective_to: string;
}

/** Valores iniciales de una regla NUEVA (p. ej. desde el liquidador: etapa BASE y operador del tipo de cobro). */
export interface RuleDefaults {
  stage?: Stage;
  /** Compañía dueña: la regla nace con alcance PARTY. */
  partyId?: string | null;
  operator?: BuilderOperator;
  variable?: NumericVarKey | null;
}

const emptyFormData = (): RuleFormData => ({
  code: '',
  name: '',
  country_id: '',
  stage: 'SURCHARGE',
  priority: 10,
  stacking: 'SUM',
  exclusion_group: '',
  scope: 'COUNTRY',
  party_id: '',
  reason: '',
  active: true,
  effective_from: '',
  effective_to: '',
});

const formFromRule = (rule: Record<string, unknown>): RuleFormData => ({
  code: (rule.code as string | undefined) || '',
  name: (rule.name as string | undefined) || '',
  country_id: (rule.country_id as string | undefined) || '',
  stage: (rule.stage as Stage | undefined) || 'BASE',
  priority: (rule.priority as number | undefined) ?? 10,
  stacking: (rule.stacking as RuleFormData['stacking'] | undefined) || 'SUM',
  exclusion_group: (rule.exclusion_group as string | undefined) || '',
  scope: (rule.scope as RuleFormData['scope'] | undefined) || 'COUNTRY',
  party_id: (rule.party_id as string | undefined) || '',
  reason: (rule.reason as string | undefined) || '',
  active: (rule.active as boolean | undefined) ?? true,
  effective_from: (rule.effective_from as string | undefined) || '',
  effective_to: (rule.effective_to as string | undefined) || '',
});

export function useRuleForm(
  rule: Record<string, unknown> | undefined,
  countryId: string | null | undefined,
  defaults?: RuleDefaults,
) {
  const [formData, setFormData] = useState<RuleFormData>(emptyFormData());

  useEffect(() => {
    setFormData(rule ? formFromRule(rule) : {
      ...emptyFormData(),
      country_id: countryId ?? '',
      stage: defaults?.stage ?? 'SURCHARGE',
      scope: defaults?.partyId ? 'PARTY' : 'COUNTRY',
      party_id: defaults?.partyId ?? '',
    });
    // `defaults` suele llegar como objeto nuevo en cada render: se depende de sus valores, no de su identidad.
  }, [rule, countryId, defaults?.stage, defaults?.partyId]);

  const periodoInvertido = !!formData.effective_from && !!formData.effective_to
    && formData.effective_from > formData.effective_to;

  const updateFormField = <K extends keyof RuleFormData>(key: K, value: RuleFormData[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  return { formData, setFormData, updateFormField, periodoInvertido };
}
