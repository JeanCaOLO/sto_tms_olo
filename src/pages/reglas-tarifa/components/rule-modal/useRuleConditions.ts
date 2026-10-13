// Hook para gestionar el estado de las condiciones.
import { useEffect, useState } from 'react';
import type { ConditionBuilderForm, ConditionMode, ConditionRowForm, Pred } from '../../../../lib/tarifas/types';
import { compileConditions, emptyConditionRow, validateConditionRows } from '../../../../lib/tarifas/rule-builder';

interface UseRuleConditionsResult {
  conditionMode: ConditionMode;
  setConditionMode: (mode: ConditionMode) => void;
  conditionCombinator: 'AND' | 'OR';
  setConditionCombinator: (comb: 'AND' | 'OR') => void;
  conditionRows: ConditionRowForm[];
  addConditionRow: () => void;
  removeConditionRow: (index: number) => void;
  setConditionRow: (index: number, patch: Partial<ConditionRowForm>) => void;
  conditionRowErrors: Record<number, string>;
  setConditionRowErrors: (errors: Record<number, string>) => void;
  advancedConditionsJson: string;
  setAdvancedConditionsJson: (json: string) => void;
  buildConditions: () => Pred;
  currentConditionBuilder: () => ConditionBuilderForm | null;
}

export function useRuleConditions(
  rule: Record<string, unknown> | undefined,
): UseRuleConditionsResult {
  const [conditionMode, setConditionMode] = useState<ConditionMode>('always');
  const [conditionCombinator, setConditionCombinator] = useState<'AND' | 'OR'>('AND');
  const [conditionRows, setConditionRows] = useState<ConditionRowForm[]>([emptyConditionRow()]);
  const [conditionRowErrors, setConditionRowErrors] = useState<Record<number, string>>({});
  const [advancedConditionsJson, setAdvancedConditionsJson] = useState('{ "p": "ALWAYS" }');

  useEffect(() => {
    if (rule) {
      if (rule.condition_builder) {
        const cb = rule.condition_builder as ConditionBuilderForm;
        setConditionMode(cb.mode);
        setConditionCombinator(cb.combinator);
        setConditionRows(cb.rows.length > 0 ? cb.rows : [emptyConditionRow()]);
      } else if (!rule.conditions || (rule.conditions as Record<string, unknown>).p === 'ALWAYS') {
        setConditionMode('always');
        setConditionCombinator('AND');
        setConditionRows([emptyConditionRow()]);
      } else {
        setConditionMode('advanced');
        setConditionCombinator('AND');
        setConditionRows([emptyConditionRow()]);
      }
      setAdvancedConditionsJson(JSON.stringify(rule.conditions, null, 2));
      setConditionRowErrors({});
    } else {
      setConditionMode('always');
      setConditionCombinator('AND');
      setConditionRows([emptyConditionRow()]);
      setConditionRowErrors({});
      setAdvancedConditionsJson('{ "p": "ALWAYS" }');
    }
  }, [rule]);

  const buildConditions = (): Pred => {
    if (conditionMode === 'advanced') return JSON.parse(advancedConditionsJson);
    return compileConditions({ mode: conditionMode, combinator: conditionCombinator, rows: conditionRows });
  };

  const currentConditionBuilder = (): ConditionBuilderForm | null => (
    conditionMode === 'advanced'
      ? null
      : { mode: conditionMode, combinator: conditionCombinator, rows: conditionRows }
  );

  const addConditionRow = () => setConditionRows((rows) => [...rows, emptyConditionRow()]);
  const removeConditionRow = (index: number) => setConditionRows((rows) => rows.filter((_, i) => i !== index));
  const setConditionRow = (index: number, patch: Partial<ConditionRowForm>) => setConditionRows(
    (rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
  );

  return {
    conditionMode, setConditionMode,
    conditionCombinator, setConditionCombinator,
    conditionRows, addConditionRow, removeConditionRow, setConditionRow,
    conditionRowErrors, setConditionRowErrors,
    advancedConditionsJson, setAdvancedConditionsJson,
    buildConditions, currentConditionBuilder,
  };
}
