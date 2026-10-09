// Validación de formularios del constructor de reglas.
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`.

import type { RuleBuilderForm, ConditionBuilderForm, ConditionRowForm } from '../types';
import { parseMoneyInput } from '../money';

const NON_NEGATIVE = /^\d+(\.\d+)?$/;

export type BuilderErrors = Partial<Record<keyof RuleBuilderForm, string>>;

export function validateBuilder(form: RuleBuilderForm): BuilderErrors {
  const errors: BuilderErrors = {};

  // El tarifario trae su propia clave, así que no se elige una variable: la elige la tabla.
  if (form.operator !== 'FIXED' && form.operator !== 'RATE_TABLE' && !form.variable) {
    errors.variable = 'Elegí sobre qué variable se aplica.';
  }

  if (form.operator === 'RATE_TABLE' && !(form.rateTableCode ?? '').trim()) {
    errors.rateTableCode = 'Elegí de qué tarifario sale el importe.';
  }

  // Los escalones no usan el importe único: cada tramo trae el suyo.
  if (form.operator !== 'TIERED' && !NON_NEGATIVE.test((form.value ?? '').trim())) {
    // El signo no se escribe: lo decide "aumenta / disminuye". Aceptar un negativo acá daría dos
    // maneras de expresar lo mismo y una regla que dice una cosa y hace la contraria.
    errors.value = 'Escribí el importe sin signo — si resta, marcá "Disminuye el costo".';
  }

  if (form.operator === 'PER_BLOCK') {
    if (!form.blockSize || form.blockSize <= 0) {
      errors.blockSize = 'El tamaño de bloque debe ser mayor que cero.';
    } else if (!Number.isInteger(form.blockSize)) {
      errors.blockSize = 'El tamaño de bloque debe ser un número entero.';
    }
  }

  if (form.operator === 'PERCENT' && !form.percentBase) {
    errors.percentBase = 'Indicá sobre qué base se calcula el porcentaje.';
  }

  if (form.operator === 'PERCENT') {
    if (form.percentBase?.of === 'RULE' && !(form.percentBase?.ruleCode ?? '').trim()) {
      errors.percentBase = 'Cuando usás otra regla como base, indicá cuál.';
    }
    if (form.effect === 'DECREASE') {
      const parsed = parseMoneyInput(form.value);
      if (parsed && parsed.greaterThan(100)) {
        errors.value = 'No se puede disminuir más del 100% del costo.';
      }
    }
  }

  if (form.operator === 'TIERED') {
    const tiers = form.tiers ?? [];
    if (tiers.length === 0) {
      errors.tiers = 'Agregá al menos un tramo.';
    } else {
      const hasOpenTier = tiers.some((t) => t.upTo === null);
      if (!hasOpenTier) {
        // Sin tramo abierto, una cantidad que se pase de la tabla no cobra nada. Es el error más
        // fácil de cometer y el más difícil de notar.
        errors.tiers = 'El último tramo debe quedar sin límite, para cubrir "de acá en adelante".';
      } else if (tiers.some((t) => !NON_NEGATIVE.test((t.amount ?? '').trim()))) {
        errors.tiers = 'Los importes de los tramos van sin signo.';
      } else {
        // Validar que upTo sea numérico, ascendente, y solo un null al final
        const tiersWithValues = tiers.filter((t) => t.upTo !== null);
        const nullTiers = tiers.filter((t) => t.upTo === null);

        // Verificar que upTo valores sean números validos y positivos
        for (const tier of tiersWithValues) {
          const upToNum = Number(tier.upTo);
          if (!Number.isFinite(upToNum) || upToNum < 0) {
            errors.tiers = 'Los límites de los tramos deben ser números no negativos.';
            break;
          }
        }

        // Verificar orden ascendente
        if (!errors.tiers) {
          for (let i = 0; i < tiersWithValues.length - 1; i++) {
            const current = Number(tiersWithValues[i]!.upTo);
            const next = Number(tiersWithValues[i + 1]!.upTo);
            if (current >= next) {
              errors.tiers = 'Los límites de los tramos deben estar en orden ascendente.';
              break;
            }
          }
        }

        // Verificar que haya solo un tramo abierto y sea el último
        if (nullTiers.length > 1) {
          errors.tiers = 'Solo puede haber un tramo sin límite (el último).';
        } else if (nullTiers.length === 1 && tiers[tiers.length - 1]?.upTo !== null) {
          errors.tiers = 'El tramo sin límite debe ser el último.';
        }
      }
    }
  }

  // Validar clamp: piso y tope del resultado
  const clampMin = (form.clamp?.min ?? '').trim();
  const clampMax = (form.clamp?.max ?? '').trim();
  const minValue = clampMin === '' ? null : parseMoneyInput(clampMin);
  const maxValue = clampMax === '' ? null : parseMoneyInput(clampMax);
  if ((clampMin !== '' && !minValue) || (clampMax !== '' && !maxValue)) {
    errors.clamp = 'El piso y el tope deben ser números.';
  } else if (minValue && maxValue && minValue.greaterThan(maxValue)) {
    errors.clamp = 'El piso no puede ser mayor que el tope.';
  }

  return errors;
}

export function isBuilderValid(errors: BuilderErrors): boolean {
  return Object.keys(errors).length === 0;
}

export function validateConditionRows(form: ConditionBuilderForm): Record<number, string> {
  const errors: Record<number, string> = {};
  if (form.mode !== 'rows') return errors;

  form.rows.forEach((row, index) => {
    if (!isConditionRowFilled(row)) return;
    if (row.op === 'BETWEEN') {
      const from = parseMoneyInput(row.from.trim());
      const to = parseMoneyInput(row.to.trim());

      if (!from || !Number.isFinite(from.toNumber())) {
        errors[index] = 'El "desde" debe ser un número válido.';
      } else if (!to || !Number.isFinite(to.toNumber())) {
        errors[index] = 'El "hasta" debe ser un número válido.';
      } else if (from.greaterThan(to)) {
        errors[index] = 'El "desde" no puede ser mayor que el "hasta".';
      }
    }
  });

  return errors;
}

/** Una fila con datos como para compilar. Las vacías se descartan en vez de bloquear el guardado. */
export function isConditionRowFilled(row: ConditionRowForm): boolean {
  if (row.op === 'IN') return row.values.trim() !== '';
  if (row.op === 'BETWEEN') return row.from.trim() !== '' && row.to.trim() !== '';
  return row.right.trim() !== '';
}
