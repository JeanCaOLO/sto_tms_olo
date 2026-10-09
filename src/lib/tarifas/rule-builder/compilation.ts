// Compilación de formularios del constructor a expresiones del motor.
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`.

import type {
  ConditionBuilderForm, ConditionRowForm, Expr, NumericVarKey, Pred, RuleBuilderForm, RuleEffect, Tier,
} from '../types';
import { parseMoneyInput } from '../money';
import { isConditionRowFilled } from './validation';

const PERCENT_SCALE = 100;

/** Aplica el signo del efecto. El formulario guarda el importe en positivo, siempre. */
function signed(value: string, effect: RuleEffect): string {
  const clean = value.trim();
  return effect === 'DECREASE' ? `-${clean}` : clean;
}

/** El usuario escribe 20 pensando "20%"; el motor trabaja con la fracción 0.2. */
export function percentToFraction(percent: string, effect: RuleEffect): string {
  const parsed = parseMoneyInput(percent);
  if (!parsed) return '0';
  const fraction = parsed.dividedBy(PERCENT_SCALE);
  if (fraction.isZero()) return '0';
  return (effect === 'DECREASE' ? fraction.negated() : fraction).toFixed();
}

export function compileBuilder(form: RuleBuilderForm): Expr {
  const base = compileBuilderBase(form);
  const clampMin = (form.clamp?.min ?? '').trim();
  const clampMax = (form.clamp?.max ?? '').trim();
  if (clampMin === '' && clampMax === '') return base;
  return {
    op: 'CLAMP',
    value: base,
    ...(clampMin !== '' ? { min: clampMin } : {}),
    ...(clampMax !== '' ? { max: clampMax } : {}),
  };
}

function compileBuilderBase(form: RuleBuilderForm): Expr {
  switch (form.operator) {
    case 'FIXED':
      return { op: 'FIXED', amount: signed(form.value, form.effect) };

    case 'TIMES':
      return {
        op: 'PER_UNIT',
        unit: form.variable as NumericVarKey,
        rate: signed(form.value, form.effect),
      };

    case 'PER_BLOCK':
      return {
        op: 'PER_BLOCK',
        unit: form.variable as NumericVarKey,
        blockSize: form.blockSize ?? 1,
        amount: signed(form.value, form.effect),
      };

    case 'PERCENT':
      return {
        op: 'PERCENT',
        pct: percentToFraction(form.value, form.effect),
        base: form.percentBase ?? { of: 'RUNNING_SUBTOTAL' },
      };

    case 'RATE_TABLE':
      // El `value` del formulario es el RESPALDO: lo que se cobra cuando el viaje no casa ninguna
      // fila. Sin respaldo, un viaje fuera del tarifario se liquidaría en cero sin que nadie lo
      // pida — y ese cero no se distingue de una tarifa real de cero.
      return {
        op: 'LOOKUP_TABLE',
        table: (form.rateTableCode ?? '').trim(),
        ...((form.rateTableColumn ?? '').trim() ? { column: (form.rateTableColumn ?? '').trim() } : {}),
        fallback: { op: 'FIXED', amount: signed(form.value, form.effect) },
      };

    case 'TIERED':
      return {
        op: 'TIERED',
        unit: form.variable as NumericVarKey,
        mode: form.tierMode ?? 'RATE',
        // El signo lo pone el efecto, igual que en el resto de los operadores.
        tiers: (form.tiers ?? []).map((t) => ({ upTo: t.upTo, amount: signed(t.amount, form.effect) })),
      };
  }
}

/** Tramo inicial de una regla nueva por escalones. */
export function emptyTier(): Tier {
  return { upTo: null, amount: '0' };
}

/** Tramo inicial de una fila nueva de condición. */
export function emptyConditionRow(): ConditionRowForm {
  return { left: 'km', op: 'GT', negate: false, right: '', values: '', from: '', to: '' };
}

function coerceValue(raw: string): string | number {
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

function compileConditionRow(row: ConditionRowForm): Pred {
  let pred: Pred;
  if (row.op === 'IN') {
    const values = row.values.split(',').map((v) => v.trim()).filter((v) => v !== '').map(coerceValue);
    pred = { p: 'IN', left: row.left, values };
  } else if (row.op === 'BETWEEN') {
    const fromParsed = parseMoneyInput(row.from.trim());
    const toParsed = parseMoneyInput(row.to.trim());
    // Si fallan los parseos, usar 0 como fallback (los validadores atraparán esto antes de compilar)
    const from = fromParsed ? fromParsed.toNumber() : 0;
    const to = toParsed ? toParsed.toNumber() : 0;
    pred = { p: 'BETWEEN', left: row.left, from, to };
  } else {
    pred = { p: row.op, left: row.left, right: coerceValue(row.right) };
  }
  return row.negate ? { p: 'NOT', arg: pred } : pred;
}

/** Compila la condición armada visualmente al `Pred` que ejecuta el motor. */
export function compileConditions(form: ConditionBuilderForm): Pred {
  if (form.mode === 'always') return { p: 'ALWAYS' };

  const filas = form.rows.filter(isConditionRowFilled);
  if (filas.length === 0) return { p: 'ALWAYS' };

  const preds = filas.map(compileConditionRow);
  if (preds.length === 1) return preds[0]!;
  return { p: form.combinator, args: preds };
}
