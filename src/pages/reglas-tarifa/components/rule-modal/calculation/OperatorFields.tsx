// Fila principal del cálculo: operador, variable, bloque, importe y efecto.

import Input from '../../../../../components/base/Input';
import Select from '../../../../../components/base/Select';
import { OPERATOR_LABELS, EFFECT_LABELS } from '../../../../../lib/tarifas/rule-builder';
import type { BuilderOperator, NumericVarKey, RuleEffect } from '../../../../../lib/tarifas/types';
import type { FieldsProps } from './types';

const OPERATOR_OPTIONS = (['FIXED', 'TIMES', 'PER_BLOCK', 'PERCENT', 'TIERED', 'RATE_TABLE'] as const)
  .map((op) => ({ value: op, label: OPERATOR_LABELS[op] }));
const EFFECT_OPTIONS = (['INCREASE', 'DECREASE'] as RuleEffect[]).map((v) => ({ value: v, label: EFFECT_LABELS[v] }));

interface Props extends FieldsProps {
  numericVarOptions: { value: string; label: string }[];
  currencyLabel: string;
}

function valueLabel(operator: string, currencyLabel: string) {
  if (operator === 'PERCENT') return 'Porcentaje *';
  if (operator === 'RATE_TABLE') return `Respaldo en ${currencyLabel} *`;
  return `Importe en ${currencyLabel} *`;
}

export function OperatorFields({ builder, builderErrors, onChange, numericVarOptions, currencyLabel }: Props) {
  const { operator } = builder;
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
      <Select
        label="Operador *"
        value={operator}
        onChange={(e) => onChange('operator', e.target.value as BuilderOperator)}
        options={OPERATOR_OPTIONS}
      />
      {operator !== 'FIXED' && operator !== 'RATE_TABLE' && (
        <Select
          label="Variable *"
          value={builder.variable ?? ''}
          onChange={(e) => onChange('variable', e.target.value as NumericVarKey)}
          options={[{ value: '', label: 'Elegir variable…' }, ...numericVarOptions]}
          error={builderErrors.variable}
        />
      )}
      {operator === 'PER_BLOCK' && (
        <Input
          label="Cada cuántas *"
          type="number"
          value={String(builder.blockSize ?? '')}
          onChange={(e) => onChange('blockSize', Number(e.target.value))}
          error={builderErrors.blockSize}
        />
      )}
      {operator !== 'TIERED' && (
        <Input
          label={valueLabel(operator, currencyLabel)}
          value={builder.value}
          onChange={(e) => onChange('value', e.target.value)}
          placeholder={operator === 'PERCENT' ? '20' : '20.00'}
          error={builderErrors.value}
        />
      )}
      <Select
        label="Efecto *"
        value={builder.effect}
        onChange={(e) => onChange('effect', e.target.value as RuleEffect)}
        options={EFFECT_OPTIONS}
      />
    </div>
  );
}
