// El puente entre cómo piensa una persona una regla y cómo la ejecuta el motor.
//
//   formulario visual          compilar          motor
//   ─────────────────    ───────────────▶   ───────────
//   peajes × 20          →  PER_UNIT{tollCount, "20.00"}
//   aumenta el costo                                     → se suma al total
//
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`. Toda la traducción y
// toda la redacción viven acá para que se puedan probar sin montar un formulario — que es
// exactamente lo que hace `__tests__/rule-builder.test.ts`.

import type {
  BuilderOperator, ConditionBuilderForm, ConditionRowForm, ConditionRowOperator, CustomVarKey,
  Expr, NumericVarKey, PartyVariable, Pred, RuleBuilderForm, RuleEffect, Tier, TierMode, VarKey,
} from './types';

// ── Etiquetas del vocabulario visual ──────────────────────────────────────────────────────────

export const OPERATOR_LABELS: Record<BuilderOperator, string> = {
  FIXED: 'Monto fijo',
  TIMES: 'Por cada (×)',
  PER_BLOCK: 'Cada N unidades (÷)',
  PERCENT: 'Porcentaje (%)',
  TIERED: 'Por escalones',
  RATE_TABLE: 'Tarifa de tabla',
};

export const TIER_MODE_LABELS: Record<TierMode, string> = {
  FLAT: 'El tramo fija un importe fijo',
  RATE: 'El tramo fija la tarifa de todas las unidades',
  PROGRESSIVE: 'Cada tramo cobra solo sus unidades (marginal)',
};

export const TIER_MODE_HINTS: Record<TierMode, string> = {
  FLAT: 'Con 250 km y la tabla 100→2 · 300→1,50 · resto→1,20, cobra 1,50.',
  RATE: 'Con 250 km y esa misma tabla, cobra 250 × 1,50 = 375.',
  PROGRESSIVE: 'Con 250 km y esa misma tabla, cobra 100×2 + 150×1,50 = 425.',
};

export const OPERATOR_HINTS: Record<BuilderOperator, string> = {
  FIXED: 'Un importe fijo, sin depender de ninguna variable.',
  TIMES: 'Multiplica la variable por el importe. Ej: por cada peaje, $20.',
  PER_BLOCK: 'Cuenta bloques COMPLETOS. Ej: cada 10 peajes, $15 — con 25 peajes se pagan 2 bloques.',
  PERCENT: 'Un porcentaje sobre una base que elegís explícitamente.',
  TIERED: 'Tramos por cantidad. El modo decide si el tramo fija un importe, una tarifa, o cobra solo lo suyo.',
  RATE_TABLE: 'El importe sale de un tarifario cargado aparte. Acá se elige cuál y cuánto cobrar si el viaje no casa ninguna fila.',
};

export const EFFECT_LABELS: Record<RuleEffect, string> = {
  INCREASE: 'Aumenta el costo',
  DECREASE: 'Disminuye el costo',
};

export function isCustomVar(key: string): key is CustomVarKey {
  return key.startsWith('custom:');
}

export function customVarKey(rawKey: string): CustomVarKey {
  const clean = rawKey.trim().replace(/^custom:/, '');
  return `custom:${clean}`;
}

// ── Validación ────────────────────────────────────────────────────────────────────────────────

export type BuilderErrors = Partial<Record<keyof RuleBuilderForm, string>>;

const NON_NEGATIVE = /^\d+(\.\d+)?$/;

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
    }
  }

  if (form.operator === 'PERCENT' && !form.percentBase) {
    errors.percentBase = 'Indicá sobre qué base se calcula el porcentaje.';
  }

  if (form.operator === 'TIERED') {
    const tiers = form.tiers ?? [];
    if (tiers.length === 0) {
      errors.tiers = 'Agregá al menos un tramo.';
    } else if (!tiers.some((t) => t.upTo === null)) {
      // Sin tramo abierto, una cantidad que se pase de la tabla no cobra nada. Es el error más
      // fácil de cometer y el más difícil de notar.
      errors.tiers = 'El último tramo debe quedar sin límite, para cubrir "de acá en adelante".';
    } else if (tiers.some((t) => !NON_NEGATIVE.test((t.amount ?? '').trim()))) {
      errors.tiers = 'Los importes de los tramos van sin signo.';
    }
  }

  const clampMin = (form.clamp?.min ?? '').trim();
  const clampMax = (form.clamp?.max ?? '').trim();
  if (clampMin !== '' && clampMax !== '' && Number(clampMin) > Number(clampMax)) {
    errors.clamp = 'El piso no puede ser mayor que el tope.';
  }

  return errors;
}

export function isBuilderValid(errors: BuilderErrors): boolean {
  return Object.keys(errors).length === 0;
}

// ── Compilación: forma visual -> expresión del motor ──────────────────────────────────────────

/** Aplica el signo del efecto. El formulario guarda el importe en positivo, siempre. */
function signed(value: string, effect: RuleEffect): string {
  const clean = value.trim();
  return effect === 'DECREASE' ? `-${clean}` : clean;
}

/** El usuario escribe 20 pensando "20%"; el motor trabaja con la fracción 0.2. */
export function percentToFraction(percent: string, effect: RuleEffect): string {
  const asNumber = Number(percent.trim());
  if (Number.isNaN(asNumber)) return '0';
  const fraction = asNumber / 100;
  return String(effect === 'DECREASE' ? -fraction : fraction);
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

// ── Condiciones: forma visual -> Pred ────────────────────────────────────────────────────────────
//
// Mismo patrón que el cálculo: `ConditionBuilderForm` es lo que arma la persona, `compileConditions`
// lo traduce al `Pred` que ejecuta el motor, y la forma se guarda aparte para poder REABRIRLA en el
// formulario simple (A1) en vez de forzar JSON en la segunda edición.

export const CONDITION_ROW_OP_LABELS: Record<ConditionRowOperator, string> = {
  EQ: '= igual a',
  NEQ: '≠ distinto de',
  GT: '> mayor que',
  GTE: '≥ mayor o igual que',
  LT: '< menor que',
  LTE: '≤ menor o igual que',
  IN: 'está en la lista',
  BETWEEN: 'está entre',
};

/** Tramo inicial de una fila nueva de condición. */
export function emptyConditionRow(): ConditionRowForm {
  return { left: 'tollCount', op: 'GT', negate: false, right: '', values: '', from: '', to: '' };
}

function coerceValue(raw: string): string | number {
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

/** Una fila con datos como para compilar. Las vacías se descartan en vez de bloquear el guardado. */
export function isConditionRowFilled(row: ConditionRowForm): boolean {
  if (row.op === 'IN') return row.values.trim() !== '';
  if (row.op === 'BETWEEN') return row.from.trim() !== '' && row.to.trim() !== '';
  return row.right.trim() !== '';
}

function compileConditionRow(row: ConditionRowForm): Pred {
  let pred: Pred;
  if (row.op === 'IN') {
    const values = row.values.split(',').map((v) => v.trim()).filter((v) => v !== '').map(coerceValue);
    pred = { p: 'IN', left: row.left, values };
  } else if (row.op === 'BETWEEN') {
    pred = { p: 'BETWEEN', left: row.left, from: Number(row.from), to: Number(row.to) };
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

/** Errores de las filas de condición: por índice, para marcar la fila puntual en el formulario. */
export function validateConditionRows(form: ConditionBuilderForm): Record<number, string> {
  const errors: Record<number, string> = {};
  if (form.mode !== 'rows') return errors;

  form.rows.forEach((row, index) => {
    if (!isConditionRowFilled(row)) return;
    if (row.op === 'BETWEEN' && Number(row.from) > Number(row.to)) {
      errors[index] = 'El "desde" no puede ser mayor que el "hasta".';
    }
  });

  return errors;
}

// ── Redacción automática ──────────────────────────────────────────────────────────────────────

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
      cuerpo = `${verbo} el importe que diga el tarifario ${(form.rateTableCode ?? '').trim()} `
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

// ── Variables usadas ──────────────────────────────────────────────────────────────────────────

function collectFromPred(pred: Pred, into: Set<VarKey>): void {
  switch (pred.p) {
    case 'ALWAYS':
      return;
    case 'AND':
    case 'OR':
      pred.args.forEach((arg) => collectFromPred(arg, into));
      return;
    case 'NOT':
      collectFromPred(pred.arg, into);
      return;
    default:
      into.add(pred.left);
  }
}

function collectFromExpr(expr: Expr, into: Set<VarKey>): void {
  switch (expr.op) {
    case 'FIXED':
      return;
    case 'PER_UNIT':
    case 'TIERED':
    case 'PER_BLOCK':
      into.add(expr.unit);
      return;
    case 'PER_KM':
      into.add('km');
      return;
    case 'PERCENT':
      return;
    case 'LOOKUP_TABLE':
      // Las variables de la clave las declara la tabla, no la expresión: se resuelven al mostrar.
      collectFromExpr(expr.fallback, into);
      return;
    case 'MIN':
    case 'MAX':
      expr.args.forEach((arg) => collectFromExpr(arg, into));
      return;
    case 'CLAMP':
      collectFromExpr(expr.value, into);
      return;
    case 'IF':
      collectFromPred(expr.cond, into);
      collectFromExpr(expr.then, into);
      collectFromExpr(expr.else, into);
  }
}

/**
 * Qué variables toca una regla, mirando condición y expresión. Sirve para dos cosas: mostrar
 * "Variables usadas" en la ficha de la regla, y detectar que una regla quedó apuntando a una
 * variable personalizada que la compañía borró.
 */
export function collectVarKeys(rule: { conditions: Pred; expression: Expr }): VarKey[] {
  const keys = new Set<VarKey>();
  collectFromPred(rule.conditions, keys);
  collectFromExpr(rule.expression, keys);
  return [...keys];
}

/** Variables personalizadas que una regla nombra pero la compañía no tiene declaradas. */
export function findMissingCustomVars(
  rule: { conditions: Pred; expression: Expr },
  declared: Pick<PartyVariable, 'key' | 'active'>[],
): CustomVarKey[] {
  const available = new Set(declared.filter((v) => v.active).map((v) => v.key));
  return collectVarKeys(rule).filter(
    (key): key is CustomVarKey => isCustomVar(key) && !available.has(key),
  );
}
