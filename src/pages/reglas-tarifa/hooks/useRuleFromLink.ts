import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RuleRow } from '../types';

export function useRuleFromLink(
  rules: RuleRow[],
  onRuleFound: (rule: RuleRow) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const ruleFromLink = searchParams.get('regla');

  useEffect(() => {
    if (!ruleFromLink || rules.length === 0) return;
    const found = rules.find((r) => r.id === ruleFromLink);
    if (found) {
      onRuleFound(found);
    }
    setSearchParams({}, { replace: true });
  }, [ruleFromLink, rules, setSearchParams, onRuleFound]);
}
