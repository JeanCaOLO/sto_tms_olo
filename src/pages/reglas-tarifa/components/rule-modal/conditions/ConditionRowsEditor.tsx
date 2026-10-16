// Condiciones en modo "Si se cumple…": filas variable / operador / valor, con negación y combinador.

import Button from '../../../../../components/base/Button';
import Input from '../../../../../components/base/Input';
import Select from '../../../../../components/base/Select';
import { CONDITION_ROW_OP_LABELS } from '../../../../../lib/tarifas/rule-builder';
import type { ConditionRowForm, ConditionRowOperator, VarKey } from '../../../../../lib/tarifas/types';

const OP_OPTIONS = (['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'BETWEEN'] as const)
  .map((op) => ({ value: op, label: CONDITION_ROW_OP_LABELS[op] }));

const COMBINATORS = [
  { value: 'AND' as const, label: 'todas (Y)' },
  { value: 'OR' as const, label: 'alguna (O)' },
];

interface Props {
  rows: ConditionRowForm[];
  combinator: 'AND' | 'OR';
  errors: Record<number, string>;
  varOptions: { value: string; label: string }[];
  onCombinatorChange: (comb: 'AND' | 'OR') => void;
  onRowChange: (index: number, patch: Partial<ConditionRowForm>) => void;
  onRowRemove: (index: number) => void;
  onRowAdd: () => void;
}

interface RowProps {
  row: ConditionRowForm;
  error: string | undefined;
  varOptions: { value: string; label: string }[];
  onChange: (patch: Partial<ConditionRowForm>) => void;
  onRemove: () => void;
}

function RowValue({ row, onChange }: Pick<RowProps, 'row' | 'onChange'>) {
  if (row.op === 'BETWEEN') {
    return (
      <>
        <div className="w-28">
          <Input value={row.from} onChange={(e) => onChange({ from: e.target.value })} placeholder="Desde" />
        </div>
        <div className="w-28">
          <Input value={row.to} onChange={(e) => onChange({ to: e.target.value })} placeholder="Hasta" />
        </div>
      </>
    );
  }
  if (row.op === 'IN') {
    return (
      <div className="flex-1 min-w-40">
        <Input value={row.values} onChange={(e) => onChange({ values: e.target.value })} placeholder="valor1, valor2, valor3" />
      </div>
    );
  }
  return (
    <div className="flex-1 min-w-32">
      <Input value={row.right} onChange={(e) => onChange({ right: e.target.value })} placeholder="20" />
    </div>
  );
}

function ConditionRow({ row, error, varOptions, onChange, onRemove }: RowProps) {
  const negateClass = row.negate ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-300 text-gray-500';
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 items-end">
        <button
          type="button"
          title="Negar esta condición"
          onClick={() => onChange({ negate: !row.negate })}
          className={`px-2 py-2 text-xs rounded-lg border transition-colors ${negateClass}`}
        >
          NO
        </button>
        <div className="w-48">
          <Select value={row.left} onChange={(e) => onChange({ left: e.target.value as VarKey })} options={varOptions} />
        </div>
        <div className="w-44">
          <Select
            value={row.op}
            onChange={(e) => onChange({ op: e.target.value as ConditionRowOperator })}
            options={OP_OPTIONS}
          />
        </div>
        <RowValue row={row} onChange={onChange} />
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <i className="ri-delete-bin-line"></i>
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ConditionRowsEditor({
  rows, combinator, errors, varOptions, onCombinatorChange, onRowChange, onRowRemove, onRowAdd,
}: Props) {
  return (
    <div className="space-y-2">
      {rows.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>Se cumplen</span>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {COMBINATORS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onCombinatorChange(value)}
                className={`px-2 py-0.5 rounded-md transition-colors ${combinator === value ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {rows.map((row, index) => (
        <ConditionRow
          key={index}
          row={row}
          error={errors[index]}
          varOptions={varOptions}
          onChange={(patch) => onRowChange(index, patch)}
          onRemove={() => onRowRemove(index)}
        />
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={onRowAdd}>
        <i className="ri-add-line mr-1"></i> Agregar condición
      </Button>
    </div>
  );
}
