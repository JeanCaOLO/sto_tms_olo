// Lo que `RuleModal` arma con sus hooks y reparte a las secciones del formulario.

import type { useRuleForm } from './useRuleForm';
import type { useRuleConditions } from './useRuleConditions';
import type { useRuleBuilder } from './useRuleBuilder';
import type { useRuleCatalogs } from './useRuleCatalogs';
import type { useRuleProbe } from './useRuleProbe';
import type { useRuleDescription } from './useRuleDescription';
import type { useRuleAnalysis } from './useRuleAnalysis';

export interface RuleModalModel {
  rule?: Record<string, unknown>;
  form: ReturnType<typeof useRuleForm>;
  conditions: ReturnType<typeof useRuleConditions>;
  calc: ReturnType<typeof useRuleBuilder>;
  catalogs: ReturnType<typeof useRuleCatalogs>;
  probe: ReturnType<typeof useRuleProbe>;
  description: ReturnType<typeof useRuleDescription>;
  analysis: ReturnType<typeof useRuleAnalysis>;
  currencyLabel: string;
}
