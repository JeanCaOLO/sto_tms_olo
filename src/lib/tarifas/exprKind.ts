// Qué cobra una expresión: el tipo de cobro (forma de cobro de la base) y el concepto cobrado.
// Lógica pura.

import type { BaseMethodId, Expr } from './types';

/** Qué cobra una expresión: el tipo de cobro al que pertenece y el concepto (para detectar duplicados). */
export interface ExprKind {
  method: BaseMethodId;
  /** Concepto cobrado: 'km', 'volume', 'unit:<variable>' o 'fixed'. */
  concept: string;
  /** Si el monto sale de un tarifario, su código. */
  table?: string;
}

function kindOfUnit(unit: string): ExprKind {
  if (unit === 'km') return { method: 'PER_KM', concept: 'km' };
  if (unit === 'truckVolumeM3') return { method: 'VOLUME', concept: 'volume' };
  return { method: 'PER_UNIT', concept: `unit:${unit}` };
}

/** Clasifica una expresión. Null = no es un cobro "por algo" (porcentajes, expresiones mixtas). */
export function classifyExpr(expr: Expr): ExprKind | null {
  switch (expr.op) {
    case 'FIXED':
      return { method: 'FIXED', concept: 'fixed' };
    case 'PER_KM':
      return { method: 'PER_KM', concept: 'km' };
    case 'PER_UNIT':
    case 'TIERED':
    case 'PER_BLOCK':
      return kindOfUnit(expr.unit);
    case 'LOOKUP_TABLE':
      // Un tarifario por zona/camión da un importe por viaje: es la tarifa fija de siempre.
      return { method: 'FIXED', concept: 'fixed', table: expr.table };
    case 'CLAMP':
      return classifyExpr(expr.value);
    case 'MIN':
    case 'MAX':
      return expr.args[0] ? classifyExpr(expr.args[0]) : null;
    case 'IF':
      return classifyExpr(expr.then);
    default:
      return null;
  }
}
