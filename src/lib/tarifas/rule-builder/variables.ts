// Colección de variables usadas por una regla.
// Módulo PURO: no importa React, ni la capa de datos, ni usa `Date.now()`.

import type { CustomVarKey, Expr, PartyVariable, Pred, VarKey } from '../types';

export function isCustomVar(key: string): key is CustomVarKey {
  return key.startsWith('custom:');
}

export function customVarKey(rawKey: string): CustomVarKey {
  const clean = rawKey.trim().replace(/^custom:/, '');
  return `custom:${clean}`;
}

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
