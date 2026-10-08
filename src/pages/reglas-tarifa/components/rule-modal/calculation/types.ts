// Tipos comunes de las partes de la sección de cálculo de la regla.

import type { BuilderErrors } from '../../../../../lib/tarifas/rule-builder';
import type { RuleBuilderForm } from '../../../../../lib/tarifas/types';

export type BuilderFieldChange = <K extends keyof RuleBuilderForm>(key: K, value: RuleBuilderForm[K]) => void;

export interface RateTableOption {
  code: string;
  name: string;
  keyColumns: string[];
  valueColumns: string[];
}

export interface FieldsProps {
  builder: RuleBuilderForm;
  builderErrors: BuilderErrors;
  onChange: BuilderFieldChange;
}

export type Tier = NonNullable<RuleBuilderForm['tiers']>[number];
