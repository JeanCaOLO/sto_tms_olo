// Hook para gestionar descripción autogenerada y táctil.
import { useEffect, useMemo, useState } from 'react';
import type { RuleBuilderForm, Pred } from '../../../../lib/tarifas/types';
import { describeBuilder } from '../../../../lib/tarifas/rule-builder';
import { formatPred } from '../../../../lib/tarifas/format';

interface UseRuleDescriptionResult {
  description: string;
  setDescription: (desc: string) => void;
  descriptionTouched: boolean;
  setDescriptionTouched: (touched: boolean) => void;
  effectiveDescription: string;
  autoDescription: string;
}

interface DescriptionOptions {
  varLabel: (k: string) => string;
  currency: string;
  conditionText: string | null;
}

export function useRuleDescription(
  rule: Record<string, unknown> | undefined,
  builder: RuleBuilderForm,
  options: DescriptionOptions,
): UseRuleDescriptionResult {
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);

  useEffect(() => {
    if (rule) {
      setDescription((rule.description as string | undefined) || '');
      setDescriptionTouched(!!rule.description);
    } else {
      setDescription('');
      setDescriptionTouched(false);
    }
  }, [rule]);

  const autoDescription = useMemo(
    () => describeBuilder(builder, {
      varLabel: options.varLabel,
      currency: options.currency,
      conditionText: options.conditionText,
    }),
    [builder, options],
  );

  const effectiveDescription = descriptionTouched ? description : autoDescription;

  return {
    description, setDescription,
    descriptionTouched, setDescriptionTouched,
    effectiveDescription, autoDescription,
  };
}
