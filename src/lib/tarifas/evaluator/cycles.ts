// Detección de ciclos entre reglas: referencias circulares en porcentajes.

import type { Expr, Rule } from '../types';

/** Códigos de regla que una expresión referencia como base de un porcentaje. */
function referencedRuleCodes(expr: Expr, into: Set<string> = new Set()): Set<string> {
  switch (expr.op) {
    case 'PERCENT':
      if (expr.base.of === 'RULE') into.add(expr.base.ruleCode);
      return into;
    case 'LOOKUP_TABLE':
      return referencedRuleCodes(expr.fallback, into);
    case 'MIN':
    case 'MAX':
      expr.args.forEach((arg) => referencedRuleCodes(arg, into));
      return into;
    case 'CLAMP':
      return referencedRuleCodes(expr.value, into);
    case 'IF':
      referencedRuleCodes(expr.then, into);
      return referencedRuleCodes(expr.else, into);
    default:
      return into;
  }
}

/**
 * Ciclos de referencias entre porcentajes ("A es 10% de B, B es 10% de A"). Sin esto, el motor los
 * resolvía como cero y devolvía un total plausible pero equivocado. Se detecta ANTES de evaluar,
 * con un recorrido en profundidad clásico sobre el grafo de referencias.
 */
export function detectRuleCycles(rules: Rule[]): string[][] {
  const byCode = new Map(rules.map((r) => [r.code, r]));
  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (code: string, path: string[]): void => {
    if (state.get(code) === 'done') return;
    if (state.get(code) === 'visiting') {
      cycles.push([...path.slice(path.indexOf(code)), code]);
      return;
    }
    const rule = byCode.get(code);
    if (!rule) return;

    state.set(code, 'visiting');
    for (const referenced of referencedRuleCodes(rule.expression)) {
      visit(referenced, [...path, code]);
    }
    state.set(code, 'done');
  };

  for (const rule of rules) visit(rule.code, []);
  return cycles;
}
