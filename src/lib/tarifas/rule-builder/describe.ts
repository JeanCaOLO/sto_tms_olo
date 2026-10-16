// Redacción automática de reglas en lenguaje natural.
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`.

import type { RuleBuilderForm, VarKey } from '../types';

export interface DescribeContext {
  /** Cómo se llama cada variable en pantalla. */
  varLabel: (key: VarKey) => string;
  /** Moneda en la que se entiende el importe. */
  currency: string;
  /** Texto legible de la condición, si la regla tiene una. */
  conditionText?: string | null;
}

const BASE_LABELS: Record<string, string> = {
  STAGE_SUBTOTAL: 'el subtotal de la etapa',
  RUNNING_SUBTOTAL: 'el subtotal acumulado',
  RULE: 'el monto de otra regla',
};

function amountText(value: string, currency: string): string {
  return `${value.trim()} ${currency}`;
}

/**
 * Arma la frase que explica la regla. Es lo que el usuario lee mientras la construye y lo que queda
 * guardado como descripción, así que se redacta como la diría una persona, no como la ejecuta el
 * motor.
 */
export function describeBuilder(form: RuleBuilderForm, ctx: DescribeContext): string {
  const verbo = form.effect === 'DECREASE' ? 'se descuenta' : 'se suma';
  const variable = form.variable ? ctx.varLabel(form.variable).toLowerCase() : '';

  let cuerpo: string;
  switch (form.operator) {
    case 'FIXED':
      cuerpo = `${verbo} ${amountText(form.value, ctx.currency)} al total`;
      break;
    case 'TIMES':
      cuerpo = `por cada unidad de ${variable} ${verbo} ${amountText(form.value, ctx.currency)}`;
      break;
    case 'PER_BLOCK':
      cuerpo = `cada ${form.blockSize ?? 1} de ${variable} ${verbo} ${amountText(form.value, ctx.currency)}`;
      break;
    case 'PERCENT': {
      const base = BASE_LABELS[form.percentBase?.of ?? 'RUNNING_SUBTOTAL'] ?? 'el subtotal acumulado';
      cuerpo = `${verbo} un ${form.value.trim()}% de ${base}`;
      break;
    }
    case 'RATE_TABLE': {
      const respaldo = amountText(form.value, ctx.currency);
      const columna = (form.rateTableColumn ?? '').trim();
      cuerpo = `${verbo} el importe que diga el tarifario ${(form.rateTableCode ?? '').trim()}`
        + `${columna ? ` (columna ${columna})` : ''} `
        + `(y ${respaldo} si el viaje no está en la tabla)`;
      break;
    }
    case 'TIERED': {
      const tramos = (form.tiers ?? []).length;
      const modo = form.tierMode ?? 'RATE';
      const como = modo === 'FLAT'
        ? 'un importe fijo según el tramo'
        : modo === 'RATE'
          ? 'la tarifa del tramo por cada unidad'
          : 'la tarifa de cada tramo solo por sus unidades';
      cuerpo = `según ${variable}, en ${tramos} tramo${tramos === 1 ? '' : 's'}, ${verbo} ${como}`;
      break;
    }
  }

  const clampMin = form.clamp?.min?.trim();
  const clampMax = form.clamp?.max?.trim();
  if (clampMin && clampMax) {
    cuerpo += `, sin bajar de ${amountText(clampMin, ctx.currency)} ni pasar de ${amountText(clampMax, ctx.currency)}`;
  } else if (clampMax) {
    cuerpo += `, sin pasar de ${amountText(clampMax, ctx.currency)}`;
  } else if (clampMin) {
    cuerpo += `, sin bajar de ${amountText(clampMin, ctx.currency)}`;
  }

  const condicion = ctx.conditionText?.trim();
  const frase = condicion && condicion.toLowerCase() !== 'siempre'
    ? `Si ${condicion.toLowerCase()}, ${cuerpo}`
    : cuerpo.charAt(0).toUpperCase() + cuerpo.slice(1);

  return `${frase}.`;
}
