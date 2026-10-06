// Variables personalizadas de una compañía: los campos que cada compañía agrega para calcular su
// liquidación cuando el vocabulario que trae el sistema no le alcanza.
//
// Va por la capa de datos (`./data`), así que viaja a Postgres con el resto sin cambios acá.

import { db, type Row } from './data';
import { customVarKey } from './rule-builder';
import type { CustomVarOrigin, PartyVariable } from './types';

export interface PartyVariableInput {
  partyId: string;
  /** Se normaliza a `custom:<clave>`; el usuario escribe solo la clave. */
  key: string;
  label: string;
  kind: 'NUMBER' | 'TEXT';
  origin: CustomVarOrigin;
  defaultValue: string | null;
  unit: string | null;
  active: boolean;
}

export type VariableErrors = Partial<Record<keyof PartyVariableInput, string>>;

export type SaveVariableResult =
  | { status: 'saved'; variable: PartyVariable }
  | { status: 'invalid'; errors: VariableErrors }
  | { status: 'failed'; error: { message: string } };

const KEY_FORMAT = /^[a-z][a-z0-9_]*$/i;

function toDomain(row: Row): PartyVariable {
  return {
    id: row.id,
    partyId: row.party_id,
    key: row.key,
    label: row.label,
    kind: row.kind,
    origin: row.origin,
    defaultValue: row.default_value ?? null,
    unit: row.unit ?? null,
    active: !!row.active,
  };
}

export async function listPartyVariables(
  partyId: string,
  options?: { includeInactive?: boolean },
): Promise<PartyVariable[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [
    { column: 'party_id', op: 'eq', value: partyId },
  ];
  if (!options?.includeInactive) where.push({ column: 'active', op: 'eq', value: true });

  const rows = await db().find('partyVariable', {
    where,
    orderBy: [{ column: 'label', locale: true }],
  });
  return rows.map(toDomain);
}

/** Todas las variables de todas las compañías. La usa el editor de reglas para rotular. */
export async function listAllPartyVariables(): Promise<PartyVariable[]> {
  return (await db().find('partyVariable')).map(toDomain);
}

export function validateVariable(
  input: PartyVariableInput,
  existing: Pick<PartyVariable, 'id' | 'key' | 'partyId'>[],
  id?: string,
): VariableErrors {
  const errors: VariableErrors = {};
  const key = input.key.trim().replace(/^custom:/, '');

  if (!key) {
    errors.key = 'La clave es obligatoria.';
  } else if (!KEY_FORMAT.test(key)) {
    // Sin espacios ni símbolos: la clave se usa dentro de las reglas, donde tiene que ser estable
    // aunque después cambien el nombre visible.
    errors.key = 'Usá letras, números y guion bajo, empezando por una letra. Ej: horas_espera';
  } else if (
    existing.some((v) => v.id !== id && v.partyId === input.partyId && v.key === customVarKey(key))
  ) {
    errors.key = 'Esta compañía ya tiene una variable con esa clave.';
  }

  if (!input.label.trim()) errors.label = 'El nombre visible es obligatorio.';

  if (input.origin === 'CONSTANT' && !String(input.defaultValue ?? '').trim()) {
    errors.defaultValue = 'Una constante necesita un valor: es el que se usa en todos los viajes.';
  }

  if (input.kind === 'NUMBER' && String(input.defaultValue ?? '').trim()) {
    if (Number.isNaN(Number(input.defaultValue))) {
      errors.defaultValue = 'La variable es numérica: el valor debe ser un número.';
    }
  }

  return errors;
}

export async function savePartyVariable(
  input: PartyVariableInput,
  id?: string,
): Promise<SaveVariableResult> {
  const existing = (await db().find('partyVariable')).map(toDomain);
  const errors = validateVariable(input, existing, id);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const values: Row = {
    party_id: input.partyId,
    key: customVarKey(input.key),
    label: input.label.trim(),
    kind: input.kind,
    origin: input.origin,
    default_value: String(input.defaultValue ?? '').trim() || null,
    unit: input.unit?.trim() || null,
    active: input.active,
  };

  try {
    const saved = id
      ? await db().update('partyVariable', id, values)
      : await db().insert('partyVariable', values);
    return { status: 'saved', variable: toDomain(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Baja LÓGICA, igual que con las compañías. Puede haber reglas que nombren esta variable: borrarla
 * de verdad las dejaría apuntando a la nada sin aviso. Desactivada, deja de ofrecerse en el editor
 * y el detector de variables faltantes marca las reglas que todavía la usan.
 */
export async function deactivatePartyVariable(id: string): Promise<{ error: string | null }> {
  try {
    await db().update('partyVariable', id, { active: false });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function reactivatePartyVariable(id: string): Promise<{ error: string | null }> {
  try {
    await db().update('partyVariable', id, { active: true });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Mapa clave -> etiqueta, para rotular variables personalizadas en cualquier pantalla. */
export function labelsOf(variables: PartyVariable[]): Record<string, string> {
  return Object.fromEntries(variables.map((v) => [v.key, v.label]));
}
