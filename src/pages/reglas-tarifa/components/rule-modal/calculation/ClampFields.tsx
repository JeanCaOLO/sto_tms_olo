// Piso y tope del importe de la regla.

import Input from '../../../../../components/base/Input';
import type { FieldsProps } from './types';

export function ClampFields({ builder, builderErrors, onChange, currencyLabel }: FieldsProps & { currencyLabel: string }) {
  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
      <Input
        label={`Piso — no baja de (${currencyLabel})`}
        value={builder.clamp?.min ?? ''}
        onChange={(e) => onChange('clamp', { ...builder.clamp, min: e.target.value })}
        placeholder="sin piso"
      />
      <Input
        label={`Tope — no pasa de (${currencyLabel})`}
        value={builder.clamp?.max ?? ''}
        onChange={(e) => onChange('clamp', { ...builder.clamp, max: e.target.value })}
        placeholder="sin tope"
        error={builderErrors.clamp}
      />
    </div>
  );
}
