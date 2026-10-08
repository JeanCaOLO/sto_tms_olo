import { COST_DRIVER_LABELS } from '../../../../lib/tarifas/cost';
import type { CostDriver } from '../../../../lib/tarifas/types';
import type { TargetField } from '../../../../lib/tarifas/costSheetParser';

export const DRIVER_OPTIONS = (Object.keys(COST_DRIVER_LABELS) as CostDriver[])
  .map((d) => ({ value: d, label: COST_DRIVER_LABELS[d] }));

export const FIELD_OPTIONS = [
  { value: 'ignore' as const, label: 'No importar' },
  { value: 'label' as const, label: 'Concepto' },
  { value: 'amount' as const, label: 'Importe' },
  { value: 'unit' as const, label: 'Unidad' },
  { value: 'code' as const, label: 'Código' },
];

/** Asigna un destino a una columna; un destino (salvo "No importar") solo puede tener una columna. */
export function assignField(prev: TargetField[], columnIndex: number, value: TargetField): TargetField[] {
  const next = [...prev];
  if (value !== 'ignore') {
    for (let i = 0; i < next.length; i += 1) {
      if (next[i] === value) next[i] = 'ignore';
    }
  }
  next[columnIndex] = value;
  return next;
}
