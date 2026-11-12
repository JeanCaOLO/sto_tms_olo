// Operador "Porcentaje": sobre qué base se calcula (subtotal acumulado, una etapa u otra regla).

import Input from '../../../../../components/base/Input';
import Select from '../../../../../components/base/Select';
import type { BaseRef, Stage } from '../../../../../lib/tarifas/types';
import { PHASE_OPTIONS } from '../stageOptions';
import type { FieldsProps } from './types';

const BASE_OPTIONS = [
  { value: 'RUNNING_SUBTOTAL', label: 'El subtotal acumulado hasta esta regla' },
  { value: 'STAGE_SUBTOTAL', label: 'El subtotal de una fase' },
  { value: 'RULE', label: 'El monto de otra regla' },
];

type BaseKind = 'STAGE_SUBTOTAL' | 'RUNNING_SUBTOTAL' | 'RULE';

function baseFor(of: BaseKind): BaseRef {
  if (of === 'STAGE_SUBTOTAL') return { of, stage: 'BASE' };
  if (of === 'RULE') return { of, ruleCode: '' };
  return { of: 'RUNNING_SUBTOTAL' };
}

export function PercentFields({ builder, builderErrors, onChange }: FieldsProps) {
  const base = builder.percentBase;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <Select
        label="Base del porcentaje *"
        value={(base?.of ?? 'RUNNING_SUBTOTAL') as string}
        onChange={(e) => onChange('percentBase', baseFor(e.target.value as BaseKind))}
        options={BASE_OPTIONS}
        error={builderErrors.percentBase}
      />
      {base?.of === 'STAGE_SUBTOTAL' && (
        <Select
          label="Fase base"
          value={base.stage}
          onChange={(e) => onChange('percentBase', { of: 'STAGE_SUBTOTAL', stage: e.target.value as Stage })}
          options={PHASE_OPTIONS}
        />
      )}
      {base?.of === 'RULE' && (
        <Input
          label="Código de la otra regla"
          value={base.ruleCode}
          onChange={(e) => onChange('percentBase', { of: 'RULE', ruleCode: e.target.value })}
        />
      )}
    </div>
  );
}
