// Hook para gestionar el estado del builder del cálculo y su tab.
import { useEffect, useState } from 'react';
import type { RuleBuilderForm } from '../../../../lib/tarifas/types';
import type { BuilderErrors } from '../../../../lib/tarifas/rule-builder';
import { emptyTier } from '../../../../lib/tarifas/rule-builder';

type Tab = 'simple' | 'advanced';

interface UseRuleBuilderResult {
  tab: Tab;
  setTab: (tab: Tab) => void;
  builder: RuleBuilderForm;
  setBuilder: (builder: RuleBuilderForm) => void;
  updateBuilderField: <K extends keyof RuleBuilderForm>(key: K, value: RuleBuilderForm[K]) => void;
  builderErrors: BuilderErrors;
  setBuilderErrors: (errors: BuilderErrors) => void;
  advancedExpressionJson: string;
  setAdvancedExpressionJson: (json: string) => void;
}

const emptyBuilder = (): RuleBuilderForm => ({
  variable: 'clientCount',
  operator: 'TIMES',
  value: '0',
  effect: 'INCREASE',
  blockSize: 10,
  percentBase: { of: 'RUNNING_SUBTOTAL' },
  tierMode: 'RATE',
  tiers: [emptyTier()],
});

export function useRuleBuilder(
  rule: Record<string, unknown> | undefined,
): UseRuleBuilderResult {
  const [tab, setTab] = useState<Tab>('simple');
  const [builder, setBuilder] = useState<RuleBuilderForm>(emptyBuilder());
  const [builderErrors, setBuilderErrors] = useState<BuilderErrors>({});
  const [advancedExpressionJson, setAdvancedExpressionJson] = useState('{ "op": "FIXED", "amount": "0" }');

  useEffect(() => {
    if (rule) {
      if (rule.builder) {
        setBuilder(rule.builder as RuleBuilderForm);
        setTab('simple');
      } else {
        setBuilder(emptyBuilder());
        setTab('advanced');
      }
      setAdvancedExpressionJson(JSON.stringify(rule.expression, null, 2));
      setBuilderErrors({});
    } else {
      setBuilder(emptyBuilder());
      setAdvancedExpressionJson('{ "op": "FIXED", "amount": "0" }');
      setBuilderErrors({});
      setTab('simple');
    }
  }, [rule]);

  const updateBuilderField = <K extends keyof RuleBuilderForm>(key: K, value: RuleBuilderForm[K]) => {
    setBuilder((prev) => ({ ...prev, [key]: value }));
    setBuilderErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  return {
    tab, setTab,
    builder, setBuilder, updateBuilderField,
    builderErrors, setBuilderErrors,
    advancedExpressionJson, setAdvancedExpressionJson,
  };
}
