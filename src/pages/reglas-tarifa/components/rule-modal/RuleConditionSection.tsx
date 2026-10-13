// Sección: condiciones (cuándo aplica la regla).
import type { ConditionMode, ConditionRowForm } from '../../../../lib/tarifas/types';
import { ConditionRowsEditor } from './conditions/ConditionRowsEditor';

interface RuleConditionSectionProps {
  conditionMode: ConditionMode;
  conditionCombinator: 'AND' | 'OR';
  conditionRows: ConditionRowForm[];
  conditionRowErrors: Record<number, string>;
  advancedConditionsJson: string;
  allVarOptions: { value: string; label: string }[];
  onModeChange: (mode: ConditionMode) => void;
  onCombinatorChange: (comb: 'AND' | 'OR') => void;
  onRowChange: (index: number, patch: Partial<ConditionRowForm>) => void;
  onRowAdd: () => void;
  onRowRemove: (index: number) => void;
  onErrorsChange: (errors: Record<number, string>) => void;
  onAdvancedJsonChange: (json: string) => void;
}

const MODES: { mode: ConditionMode; label: string }[] = [
  { mode: 'always', label: 'Siempre' },
  { mode: 'rows', label: 'Si se cumple…' },
  { mode: 'advanced', label: 'JSON' },
];

export default function RuleConditionSection(props: RuleConditionSectionProps) {
  const { conditionMode, advancedConditionsJson, onModeChange } = props;
  return (
    <section className="border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">¿Cuándo aplica?</h3>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onModeChange(mode)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${conditionMode === mode ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {conditionMode === 'rows' && (
        <ConditionRowsEditor
          rows={props.conditionRows}
          combinator={props.conditionCombinator}
          errors={props.conditionRowErrors}
          varOptions={props.allVarOptions}
          onCombinatorChange={props.onCombinatorChange}
          onRowChange={props.onRowChange}
          onRowRemove={props.onRowRemove}
          onRowAdd={props.onRowAdd}
        />
      )}
      {conditionMode === 'advanced' && (
        <textarea
          value={advancedConditionsJson}
          onChange={(e) => props.onAdvancedJsonChange(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      )}
    </section>
  );
}
