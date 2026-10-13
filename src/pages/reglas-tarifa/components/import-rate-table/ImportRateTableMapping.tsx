// Mapeo de columnas del archivo a las columnas del tarifario.

import Select from '../../../../components/base/Select';
import { VAR_KEY_LABELS } from '../../../../lib/tarifas/format';
import type { RateTable, VarKey } from '../../../../lib/tarifas/types';

interface Props {
  table: RateTable;
  columnOptions: { value: string; label: string }[];
  mapping: { key: (number | null)[]; amount: number | null; values?: Record<string, number | null> };
  notes: string[];
  customLabels?: Record<string, string>;
  onSetKeyColumn: (index: number, value: string) => void;
  onSetAmountColumn: (value: number | null) => void;
  onSetValueColumn: (name: string, value: number | null) => void;
}

export default function ImportRateTableMapping({
  table,
  columnOptions,
  mapping,
  notes,
  customLabels = {},
  onSetKeyColumn,
  onSetAmountColumn,
  onSetValueColumn,
}: Props) {
  const varLabelOf = (key: VarKey) =>
    VAR_KEY_LABELS[key as keyof typeof VAR_KEY_LABELS] ?? customLabels[key] ?? key;

  return (
    <>
      {notes.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg px-4 py-3 space-y-1">
          {notes.map((n) => (
            <p key={n}><i className="ri-information-line mr-1"></i>{n}</p>
          ))}
        </div>
      )}

      <div className="border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Qué columna es cada cosa</h3>
        <p className="text-xs text-slate-500 mb-3">
          Una columna de la clave sin asignar queda en comodín
          (<code className="font-mono">*</code>) en todas las filas.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {table.keyColumns.map((column, index) => (
            <Select
              key={column}
              label={varLabelOf(column)}
              value={
                mapping.key[index] === null || mapping.key[index] === undefined
                  ? ''
                  : String(mapping.key[index])
              }
              onChange={(e) => onSetKeyColumn(index, e.target.value)}
              options={columnOptions}
            />
          ))}
          <Select
            label="Importe *"
            value={mapping.amount === null ? '' : String(mapping.amount)}
            onChange={(e) => onSetAmountColumn(e.target.value === '' ? null : Number(e.target.value))}
            options={columnOptions}
          />
          {(table.valueColumns ?? []).map((name) => (
            <Select
              key={`v:${name}`}
              label={name}
              value={
                mapping.values?.[name] === null || mapping.values?.[name] === undefined
                  ? ''
                  : String(mapping.values[name])
              }
              onChange={(e) => onSetValueColumn(name, e.target.value === '' ? null : Number(e.target.value))}
              options={columnOptions}
            />
          ))}
        </div>
      </div>
    </>
  );
}
