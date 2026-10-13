// Formulario para crear/editar una fila de tarifario.

import { useState, useEffect, useMemo } from 'react';
import Button from '../../../../components/base/Button';
import Input from '../../../../components/base/Input';
import { VAR_KEY_LABELS } from '../../../../lib/tarifas/format';
import { isRangeKeyVar } from '../../../../lib/tarifas/rateTablesDataSource';
import { RATE_TABLE_WILDCARD } from '../../../../lib/tarifas/types';
import type { RateTable, VarKey } from '../../../../lib/tarifas/types';

interface Props {
  selected: RateTable | null;
  zones: { code: string; name: string }[];
  truckCodes: string[];
  carrierId: string[];
  draftKey: string[];
  draftAmount: string;
  draftValues: Record<string, string>;
  rowErrors: { key?: string; amount?: string; values?: string };
  onKeyChange: (index: number, value: string) => void;
  onAmountChange: (value: string) => void;
  onValuesChange: (name: string, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isEditing: boolean;
  canEdit: boolean;
  customLabels?: Record<string, string>;
}

export default function RateRowForm({
  selected,
  zones,
  truckCodes,
  carrierId,
  draftKey,
  draftAmount,
  draftValues,
  rowErrors,
  onKeyChange,
  onAmountChange,
  onValuesChange,
  onSave,
  onCancel,
  isEditing,
  canEdit,
  customLabels = {},
}: Props) {
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (!selected) setShowPreview(false);
  }, [selected]);

  const varLabelOf = (key: VarKey) =>
    VAR_KEY_LABELS[key as keyof typeof VAR_KEY_LABELS] ?? customLabels[key] ?? key;

  const sugerenciasDe = (column: VarKey): string[] => {
    switch (column) {
      case 'originZone':
      case 'destZone':
        return zones.map((z) => z.code);
      case 'carrierId':
        return carrierId;
      case 'truckTypeId':
        return truckCodes;
      case 'fleetType':
        return ['OWN', 'OUTSOURCED'];
      default:
        return [];
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 mb-4">
      <h4 className="text-xs font-semibold text-slate-600 uppercase mb-3">
        {isEditing ? 'Editar fila' : 'Nueva fila'}
      </h4>
      <div className="flex flex-wrap items-end gap-3">
        {selected?.keyColumns.map((column, index) => {
          const sugerencias = sugerenciasDe(column);
          const listId = `rt-${selected.id}-${column}`;
          return (
            <div key={column} className="min-w-[10rem] flex-1">
              <Input
                label={varLabelOf(column)}
                value={draftKey[index] ?? ''}
                onChange={(e) => onKeyChange(index, e.target.value)}
                placeholder={
                  isRangeKeyVar(column) || column.startsWith('custom:')
                    ? 'cualquiera · o rango 101..300'
                    : 'cualquiera'
                }
                list={sugerencias.length > 0 ? listId : undefined}
              />
              {sugerencias.length > 0 && (
                <datalist id={listId}>
                  {sugerencias.map((s) => <option key={s} value={s} />)}
                </datalist>
              )}
            </div>
          );
        })}
        <div className="min-w-[8rem]">
          <Input
            label={
              (selected?.valueColumns ?? []).length > 0
                ? 'Importe principal *'
                : 'Importe *'
            }
            value={draftAmount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="1250.00"
            error={rowErrors.amount}
          />
        </div>
        {(selected?.valueColumns ?? []).map((name) => (
          <div key={name} className="min-w-[8rem]">
            <Input
              label={name}
              value={draftValues[name] ?? ''}
              onChange={(e) => onValuesChange(name, e.target.value)}
              placeholder="opcional"
            />
          </div>
        ))}
        <div className="flex gap-2 pb-0.5">
          {isEditing && (
            <Button variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button onClick={onSave} disabled={!canEdit} title={!canEdit ? 'Tu rol no puede editar tarifarios' : undefined}>
            <i className={isEditing ? 'ri-save-line mr-1' : 'ri-add-line mr-1'}></i>
            {isEditing ? 'Guardar' : 'Agregar'}
          </Button>
        </div>
      </div>
      {rowErrors.key && <p className="text-xs text-red-600 mt-2">{rowErrors.key}</p>}
      {rowErrors.values && <p className="text-xs text-red-600 mt-2">{rowErrors.values}</p>}
    </div>
  );
}
