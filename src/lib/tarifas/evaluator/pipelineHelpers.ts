// Funciones auxiliares del pipeline de cálculo: resolución de grupos MAX y extracción de inputs.

import Decimal from 'decimal.js';
import type { DiscardedRule, Rule, VarBag } from '../types';
import { toDecimal, ZERO } from '../money';
import { evaluateExpr, type EvalContext } from './expressions';
import { RuleShapeError } from './predicates';

// Extrae las entradas relevantes de una regla para hacerla explicable en el desglose de la UI.
export function extractInputs(rule: Rule, vars: VarBag): Record<string, string | number> {
  const expr = rule.expression;
  switch (expr.op) {
    case 'FIXED':
      return { amount: expr.amount };
    case 'PER_UNIT':
      return { [expr.unit]: vars[expr.unit], rate: expr.rate };
    case 'PER_KM':
      return { km: vars.km, rate: expr.rate };
    case 'PERCENT':
      return { pct: expr.pct, base: expr.base.of };
    case 'TIERED':
      return { [expr.unit]: vars[expr.unit] };
    case 'PER_BLOCK':
      return { [expr.unit]: vars[expr.unit], cada: expr.blockSize, amount: expr.amount };
    case 'LOOKUP_TABLE':
      return expr.column ? { tabla: expr.table, columna: expr.column } : { tabla: expr.table };
    case 'MIN':
    case 'MAX':
    case 'CLAMP':
    case 'IF':
      return {};
  }
}

// Resuelve los ganadores de un grupo MAX con los montos reales.
export function resolveMaxGroup(
  group: string,
  applied: Rule[],
  ctx: EvalContext,
  warnings: string[],
  discarded: DiscardedRule[],
): string {
  const candidates = applied
    .filter((r) => r.stacking === 'MAX' && r.exclusionGroup === group)
    .map((r) => {
      let amount: Decimal;
      try {
        amount = evaluateExpr(r.expression, ctx);
      } catch (e) {
        if (!(e instanceof RuleShapeError)) throw e;
        warnings.push(`La regla "${r.code}" tiene una ${e.message}: no puede competir en su grupo MAX.`);
        amount = ZERO;
      }
      return { rule: r, amount };
    });

  const winner = candidates.reduce((best, curr) =>
    curr.amount.greaterThan(best.amount) ? curr : best);

  for (const candidate of candidates) {
    if (candidate.rule.code !== winner.rule.code) {
      discarded.push({
        ruleCode: candidate.rule.code,
        reason: 'LOST_MAX',
        detail:
          `Perdió el MAX del grupo "${group}" frente a "${winner.rule.code}" ` +
          `(${candidate.amount.toFixed(2)} contra ${winner.amount.toFixed(2)}).`,
      });
    }
  }

  return winner.rule.code;
}
