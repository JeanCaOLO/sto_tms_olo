// Operador "Tarifa de tabla": qué tarifario da el importe y qué valor de la fila se usa.

import Select from '../../../../../components/base/Select';
import { varLabel } from '../../../../../lib/tarifas/format';
import type { VarKey } from '../../../../../lib/tarifas/types';
import type { FieldsProps, RateTableOption } from './types';

interface Props extends FieldsProps {
  rateTables: RateTableOption[];
}

export function RateTableFields({ builder, builderErrors, onChange, rateTables }: Props) {
  const valueColumns = rateTables.find((t) => t.code === builder.rateTableCode)?.valueColumns ?? [];
  const tableOptions = rateTables.map((t) => ({
    value: t.code,
    label: `${t.code} — ${t.name} (${t.keyColumns.map((c) => varLabel(c as VarKey)).join(' · ')})`,
  }));

  return (
    <div className="mt-3 space-y-2">
      <Select
        label="¿De qué tarifario sale el importe? *"
        value={builder.rateTableCode ?? ''}
        onChange={(e) => { onChange('rateTableCode', e.target.value); onChange('rateTableColumn', ''); }}
        options={[
          { value: '', label: rateTables.length === 0 ? 'No hay tarifarios en este país' : 'Elegir tarifario…' },
          ...tableOptions,
        ]}
        error={builderErrors.rateTableCode}
      />
      {valueColumns.length > 0 && (
        <Select
          label="¿Qué valor de la fila usa?"
          value={builder.rateTableColumn ?? ''}
          onChange={(e) => onChange('rateTableColumn', e.target.value)}
          options={[{ value: '', label: 'El valor principal' }, ...valueColumns.map((c) => ({ value: c, label: c }))]}
        />
      )}
      {rateTables.length === 0 ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <i className="ri-alert-line mr-1"></i>
          Todavía no hay ninguno cargado. Se crean en la pestaña <strong>Tarifarios</strong>.
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          El <strong>respaldo</strong> es lo que se cobra si el viaje no casa ninguna fila del tarifario. Queda
          anotado en el desglose cuando pasa, así que un viaje sin cobertura se ve en vez de liquidarse en silencio.
        </p>
      )}
    </div>
  );
}
