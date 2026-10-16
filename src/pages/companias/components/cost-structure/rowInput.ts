import { parseMoneyInput } from '../../../../lib/tarifas/money';
import type { CostRowInput, CostStructureRow } from '../../../../lib/tarifas/costStructureDataSource';

export const INHERITED_MESSAGE = 'Esta compañía usa la estructura del país. Antes de agregar conceptos, creá una propia a '
  + 'partir de la del país (botón de arriba) o subí la plantilla completa.';

const MAX_CODE_LENGTH = 40;

export type CheckedRow = { amount: string; truckType: string | null };

/**
 * Valida lo tecleado en el formulario de fila, en este orden: estructura heredada (solo para altas),
 * concepto e importe. Devuelve el error o los valores ya normalizados.
 */
export function validateRowInput(
  row: CostRowInput,
  blockedByInherited: boolean,
): { error: string } | CheckedRow {
  if (blockedByInherited) return { error: INHERITED_MESSAGE };
  if (!row.label.trim()) return { error: 'La fila necesita un concepto.' };
  const amount = row.amount.trim();
  const parsedAmount = parseMoneyInput(amount);
  if (!parsedAmount || parsedAmount.isNegative()) return { error: 'El importe debe ser un número de cero o más.' };
  return { amount, truckType: row.truckType || null };
}

/** Código de una fila nueva: el tecleado o, si falta, uno derivado del concepto. */
export function codeForRow(row: CostRowInput): string {
  return row.code.trim()
    || row.label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, MAX_CODE_LENGTH);
}

/** Convierte una fila existente en la entrada para volver a guardarla (copia de la estructura del país). */
export function toRowInput(r: CostStructureRow): CostRowInput {
  return {
    code: r.code, label: r.label, driver: r.driver, amount: r.amount, sign: r.sign,
    appliesWhen: r.appliesWhen, unit: r.unit, active: r.active, group: r.group,
    frequency: r.frequency, frequencyQty: r.frequencyQty, unitQty: r.unitQty,
    costPerKm: r.costPerKm, truckType: r.truckType,
  };
}
