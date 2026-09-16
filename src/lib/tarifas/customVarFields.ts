// Los campos del formulario que salen de las variables personalizadas de la compañía.
//
// Cierra el agujero más silencioso del módulo: `trip.customVars` **no lo rellenaba nadie en toda la
// aplicación**. Se podía declarar una variable "por viaje", escribir una regla que la usara, verla
// ofrecida en el constructor... y que en cada liquidación resolviera siempre a su valor por
// defecto, sin campo donde cargarla y sin ningún aviso.
//
// Módulo PURO: recibe las variables declaradas, no las consulta.

import type { CustomVarKey, PartyVariable, VarValue } from './types';

export interface CustomVarField {
  key: CustomVarKey;
  label: string;
  kind: 'NUMBER' | 'TEXT';
  /** Unidad para mostrar al lado del campo ("horas", "kg"). Sólo presentación. */
  unit: string | null;
  /** Valor inicial del campo. */
  defaultValue: string;
}

/**
 * Campos que hay que dibujar: sólo las variables ACTIVAS y **por viaje**.
 *
 * Las constantes no se dibujan como campo —su valor es de la compañía, no del viaje— pero sí se
 * muestran aparte, de sólo lectura: ver la diferencia entre los dos orígenes sin abrir el catálogo
 * es lo que hace entendible por qué una suma y la otra no.
 */
export function buildCustomVarFields(variables: PartyVariable[]): CustomVarField[] {
  return variables
    .filter((v) => v.active && v.origin === 'PER_TRIP')
    .map((v) => ({
      key: v.key,
      label: v.label,
      kind: v.kind,
      unit: v.unit,
      defaultValue: v.defaultValue ?? '',
    }));
}

/** Constantes de la compañía, para mostrarlas de sólo lectura junto a los campos. */
export function constantVars(variables: PartyVariable[]): CustomVarField[] {
  return variables
    .filter((v) => v.active && v.origin === 'CONSTANT')
    .map((v) => ({
      key: v.key,
      label: v.label,
      kind: v.kind,
      unit: v.unit,
      defaultValue: v.defaultValue ?? '',
    }));
}

/** Valores iniciales: el por defecto de cada variable, no vacío. */
export function initialCustomVarValues(fields: CustomVarField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.defaultValue]));
}

export interface ParsedCustomVars {
  values: Partial<Record<CustomVarKey, VarValue>>;
  /** Errores por clave. Un número ilegible es un error de campo, no un cero silencioso. */
  errors: Record<string, string>;
}

/**
 * Convierte lo tecleado en valores para el motor.
 *
 * Una variable numérica que no parsea da ERROR, no cero: un cero silencioso es indistinguible de
 * "cargué cero", y la diferencia son las horas de espera que nadie va a cobrar.
 */
export function parseCustomVarValues(
  fields: CustomVarField[],
  raw: Record<string, string>,
): ParsedCustomVars {
  const values: Partial<Record<CustomVarKey, VarValue>> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const texto = (raw[field.key] ?? '').trim();

    if (field.kind === 'TEXT') {
      values[field.key] = texto;
      continue;
    }

    if (texto === '') {
      // Vacío en un número no es cero: es "no lo cargué". Se toma el valor por defecto declarado.
      const porDefecto = Number(field.defaultValue);
      values[field.key] = Number.isFinite(porDefecto) ? porDefecto : 0;
      continue;
    }

    const numero = Number(texto);
    if (!Number.isFinite(numero)) {
      errors[field.key] = `"${field.label}" tiene que ser un número.`;
      continue;
    }
    values[field.key] = numero;
  }

  return { values, errors };
}

/**
 * Variables que las reglas de la compañía nombran pero la compañía no declaró.
 *
 * El motor las resuelve como 0 con un aviso, que se pierde entre los demás. Mostrarlo junto a la
 * sección de variables convierte "esta regla no suma nada" en "falta declarar esta variable".
 */
export function missingDeclaredVars(
  usedKeys: string[],
  variables: PartyVariable[],
): CustomVarKey[] {
  const declaradas = new Set(variables.filter((v) => v.active).map((v) => v.key));
  return [...new Set(
    usedKeys.filter((k): k is CustomVarKey => k.startsWith('custom:') && !declaradas.has(k as CustomVarKey)),
  )];
}

/** Resumen legible de lo cargado, para el panel que explica el total. */
export function describeCustomVars(
  fields: CustomVarField[],
  values: Partial<Record<CustomVarKey, VarValue>>,
): { label: string; value: string }[] {
  return fields.map((f) => ({
    label: f.label,
    value: `${values[f.key] ?? f.defaultValue}${f.unit ? ` ${f.unit}` : ''}`,
  }));
}
