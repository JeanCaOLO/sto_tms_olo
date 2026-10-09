// Validación de filas de tarifarios.

import { parseRange, rangesOverlap } from '../../rateRange';
import { type PartyVariable, type RateTable, type RateTableRow } from '../../types';
import { isRangeKeyVar, keyFingerprint } from '../schema';
import { type RateRowErrors, type RateTableRowInput, normalizeKey } from './schema';

const AMOUNT_SHAPE = /^-?\d+(\.\d+)?$/;

export function validateRateRow(
  input: RateTableRowInput,
  table: RateTable,
  existing: RateTableRow[],
  id?: string,
  partyVariables: PartyVariable[] = [],
): RateRowErrors {
  const errors: RateRowErrors = {};
  const key = normalizeKey(input.key, table.keyColumns.length);

  const numericColumn = (column: string) =>
    isRangeKeyVar(column) || partyVariables.some((v) => v.key === column && v.kind === 'NUMBER');
  const ranges = key.map((cell) => parseRange(cell));
  for (let i = 0; i < key.length; i += 1) {
    const range = ranges[i];
    const cell = key[i]!;
    if (!range) {
      if (/\.\./.test(cell)) errors.key = `"${cell}" no es un rango válido. Use el formato 101..300, ..100 o 301..`;
      continue;
    }
    if (!numericColumn(table.keyColumns[i]!)) {
      errors.key = `La columna "${table.keyColumns[i]}" no es numérica: no admite rangos ("${cell}").`;
    } else if (range.from !== null && range.to !== null && range.from > range.to) {
      errors.key = `El rango "${cell}" está al revés: el inicio es mayor que el final.`;
    }
  }
  if (!errors.key && ranges.some(Boolean)) {
    const cruza = existing.some((r) => {
      if (r.id === id) return false;
      const other = normalizeKey(r.key, table.keyColumns.length);
      return key.every((cell, i) => {
        const mine = ranges[i];
        const theirs = parseRange(other[i]);
        if (mine && theirs) return rangesOverlap(mine, theirs);
        return cell.toUpperCase() === other[i]!.toUpperCase();
      });
    });
    if (cruza) errors.key = 'Este rango se pisa con otra fila: un mismo valor tendría dos tarifas.';
  }

  const repetida = existing.some(
    (r) => r.id !== id && keyFingerprint(normalizeKey(r.key, table.keyColumns.length)) === keyFingerprint(key),
  );
  if (repetida) {
    errors.key = 'Ya hay una fila con esta misma combinación.';
  }

  const amount = input.amount.trim();
  if (!amount) {
    errors.amount = 'El importe es obligatorio.';
  } else if (!AMOUNT_SHAPE.test(amount)) {
    errors.amount = 'Escribí un número, por ejemplo 1250.50';
  }

  const declaradas = table.valueColumns ?? [];
  const valueEntries = Object.entries(input.values ?? {})
    .map(([name, value]) => [name, String(value ?? '').trim()] as const)
    .filter(([, value]) => value !== '');

  for (const [name, value] of valueEntries) {
    if (!declaradas.includes(name)) {
      errors.values = `El tarifario no tiene la columna de valor "${name}".`;
    } else if (!AMOUNT_SHAPE.test(value)) {
      errors.values = `"${name}": escribí un número, por ejemplo 1250.50`;
    }
  }

  return errors;
}
