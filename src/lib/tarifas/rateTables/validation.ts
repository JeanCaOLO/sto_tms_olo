// Validación de tarifarios y sus columnas.

import { type PartyVariable, type RateTable } from '../types';
import { isCustomKeyVar } from './schema';

export interface RateTableInput {
  countryId: string;
  partyId: string | null;
  code: string;
  name: string;
  keyColumns: string[];
  valueColumns?: string[];
  active: boolean;
}

export type RateTableErrors = Partial<Record<keyof RateTableInput, string>>;

const CODE_SHAPE = /^[A-Z0-9_]+$/;
const VALUE_COLUMN_SHAPE = /^[A-Za-z0-9_]+$/;

function validateValueColumns(columns: string[]): string | undefined {
  const names = columns.map((c) => c.trim());
  if (names.some((c) => !c)) return 'Hay una columna de valor sin nombre.';
  const bad = names.find((c) => !VALUE_COLUMN_SHAPE.test(c));
  if (bad) return `"${bad}": usá solo letras, números y guión bajo (sin espacios ni acentos).`;
  if (names.some((c) => c.toLowerCase() === 'amount' || c.toLowerCase() === 'valor')) {
    return 'Los nombres "amount" y "valor" están reservados para el valor principal.';
  }
  if (new Set(names.map((c) => c.toLowerCase())).size !== names.length) return 'Hay una columna de valor repetida.';
  return undefined;
}

export function validateRateTable(
  input: RateTableInput,
  existing: Pick<RateTable, 'id' | 'code' | 'countryId' | 'partyId'>[],
  id?: string,
  partyVariables: PartyVariable[] = [],
): RateTableErrors {
  const errors: RateTableErrors = {};
  const code = input.code.trim().toUpperCase();

  if (!code) {
    errors.code = 'El código es obligatorio.';
  } else if (!CODE_SHAPE.test(code)) {
    errors.code = 'Usá solo letras, números y guión bajo (sin espacios ni acentos).';
  } else if (
    existing.some((t) => t.id !== id && t.countryId === input.countryId
      && (t.partyId ?? null) === (input.partyId ?? null)
      && t.code.toUpperCase() === code)
  ) {
    errors.code = 'Ya hay un tarifario con ese código en este ámbito.';
  }

  if (!input.name.trim()) errors.name = 'El nombre es obligatorio.';

  if (input.keyColumns.length === 0) {
    errors.keyColumns = 'Elegí al menos una variable para la clave.';
  } else if (new Set(input.keyColumns).size !== input.keyColumns.length) {
    errors.keyColumns = 'Hay una variable repetida en la clave.';
  } else {
    const custom = input.keyColumns.filter(isCustomKeyVar);
    if (custom.length > 0 && !input.partyId) {
      errors.keyColumns = 'Las variables personalizadas solo se pueden usar en el tarifario de una compañía.';
    } else {
      const activas = new Set(partyVariables.filter((v) => v.active).map((v) => v.key));
      const faltan = custom.filter((k) => !activas.has(k));
      if (faltan.length > 0) {
        errors.keyColumns = `La compañía no tiene activa la variable: ${faltan.join(', ')}.`;
      }
    }
  }

  const valueColumnsError = validateValueColumns(input.valueColumns ?? []);
  if (valueColumnsError) errors.valueColumns = valueColumnsError;

  return errors;
}
