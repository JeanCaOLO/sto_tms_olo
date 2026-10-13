// Evaluación de predicados (condiciones) del AST del motor de reglas.

import Decimal from 'decimal.js';
import type { Pred, VarBag } from '../types';

/** Decimal exacto del valor, o null si no es numérico (la comparación entonces es false, como con NaN). */
function toDec(value: string | number | undefined | null): Decimal | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

function compare(a: string | number, b: string | number, test: (c: number) => boolean): boolean {
  const da = toDec(a);
  const db = toDec(b);
  return da !== null && db !== null && test(da.comparedTo(db));
}

// Igualdad tolerante a tipo: 40 (number) === "40" (string) cuando ambos son numéricos.
function looseEq(a: string | number, b: string | number): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    const da = toDec(a);
    const db = toDec(b);
    if (da !== null && db !== null) return da.equals(db);
  }
  return String(a) === String(b);
}

/**
 * Una regla cuya forma el kernel no sabe leer.
 *
 * Existe para que el fallo se pueda ATRIBUIR: el pipeline la atrapa, descarta esa regla nombrándola
 * y frena la emisión, en vez de dejar que un `undefined` viaje hasta la librería de decimales y
 * reviente sin decir de quién era la culpa.
 */
export class RuleShapeError extends Error {}

// Evaluador puro de predicados. GT/GTE/LT/LTE comparan numéricamente; si la variable de la
// izquierda no es numérica, Number(...) da NaN y la comparación resulta false (falla silenciosa:
// una regla mal escrita no aplica, no rompe el cálculo del resto).
export function evaluatePred(pred: Pred, vars: VarBag): boolean {
  switch (pred.p) {
    case 'ALWAYS':
      return true;
    case 'EQ':
      return looseEq(vars[pred.left], pred.right);
    case 'NEQ':
      return !looseEq(vars[pred.left], pred.right);
    case 'GT':
      return compare(vars[pred.left], pred.right, (c) => c > 0);
    case 'GTE':
      return compare(vars[pred.left], pred.right, (c) => c >= 0);
    case 'LT':
      return compare(vars[pred.left], pred.right, (c) => c < 0);
    case 'LTE':
      return compare(vars[pred.left], pred.right, (c) => c <= 0);
    case 'IN':
      return pred.values.some((v) => looseEq(vars[pred.left], v));
    case 'BETWEEN': {
      const n = toDec(vars[pred.left]);
      return n !== null && n.gte(pred.from) && n.lte(pred.to);
    }
    case 'AND':
      return pred.args.every((p) => evaluatePred(p, vars));
    case 'OR':
      return pred.args.some((p) => evaluatePred(p, vars));
    case 'NOT':
      return !evaluatePred(pred.arg, vars);
    default:
      // Sin esta rama, una condición con una forma que el kernel no conoce devolvía `undefined`:
      // la regla no aplicaba y nadie se enteraba. Falla ruidosa y con el nombre del operador.
      throw new RuleShapeError(`condición desconocida "${(pred as { p?: string }).p ?? '(vacía)'}"`);
  }
}
