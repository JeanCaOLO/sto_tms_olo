// Lo que se deduce de la regla en edición: su condición en texto, las variables que usa y las que faltan.

import { useMemo } from 'react';
import { formatPred } from '../../../../lib/tarifas/format';
import { collectVarKeys, compileBuilder, findMissingCustomVars } from '../../../../lib/tarifas/rule-builder';
import type { PartyVariable, RuleBuilderForm } from '../../../../lib/tarifas/types';
import type { useRuleConditions } from './useRuleConditions';

export function useRuleAnalysis(
  conditions: ReturnType<typeof useRuleConditions>,
  builder: RuleBuilderForm,
  scope: string,
  partyVariables: PartyVariable[],
  customLabels: Record<string, string>,
) {
  const { conditionMode, conditionCombinator, conditionRows, advancedConditionsJson, buildConditions } = conditions;
  // `buildConditions` es una función nueva en cada render; lo que la determina son estos cuatro estados.
  const conditionKey = [conditionMode, conditionCombinator, conditionRows, advancedConditionsJson] as const;

  const conditionText = useMemo(() => {
    try { return formatPred(buildConditions(), customLabels); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...conditionKey, customLabels]);

  const usedVars = useMemo(() => {
    try { return collectVarKeys({ conditions: buildConditions(), expression: compileBuilder(builder) }); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, ...conditionKey]);

  const missingVars = useMemo(() => {
    if (scope !== 'PARTY') return [];
    try {
      return findMissingCustomVars({ conditions: buildConditions(), expression: compileBuilder(builder) }, partyVariables);
    } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, ...conditionKey, partyVariables, scope]);

  return { conditionText, usedVars, missingVars };
}
