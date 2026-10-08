// Evaluación de expresiones (operadores) del AST del motor de reglas.

import Decimal from 'decimal.js';
import type {
  BaseRef, Expr, Money, RateTable, RateTableMatch, RateTableRow, Stage, Tier, TierMode, VarBag,
} from '../types';
import { RATE_TABLE_WILDCARD, STAGE_ORDER } from '../types';
import { roundToMoney, toDecimal, ZERO } from '../money';
import { evaluatePred } from './predicates';
import { RuleShapeError } from './predicates';
import { lookupRateTable } from './lookup';
import { findTier, progressiveAmount } from './tiers';

// Re-exportar para compatibilidad hacia atrás.
export { findTier, progressiveAmount, sortTiers } from './tiers';

function decimalMin(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => (v.lessThan(acc) ? v : acc));
}

function decimalMax(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => (v.greaterThan(acc) ? v : acc));
}

function resolveBase(base: BaseRef, ctx: EvalContext): Decimal {
  switch (base.of) {
    case 'STAGE_SUBTOTAL':
      return ctx.getStageSubtotal(base.stage);
    case 'RUNNING_SUBTOTAL':
      return ctx.getRunningSubtotal();
    case 'RULE': {
      const amount = ctx.getRuleAmount(base.ruleCode);
      if (amount === null) {
        ctx.warn(`La base PERCENT referencia la regla "${base.ruleCode}", que no existe o aún no se evaluó.`);
        return ZERO;
      }
      return amount;
    }
    default:
      throw new RuleShapeError(`base de porcentaje desconocida "${(base as { of?: string }).of ?? '(vacía)'}"`);
  }
}

/**
 * Cantidad de una variable usada como unidad. Si la variable no está en el contexto —el caso típico
 * es una variable personalizada que la compañía desactivó o borró— vale CERO y se avisa, en vez de
 * reventar el cálculo entero: la regla rota no aplica, pero la liquidación se sigue pudiendo emitir.
 * Es la misma decisión que ya toma `evaluatePred` con una comparación mal escrita.
 */
function quantityOf(ctx: EvalContext, unit: string): Decimal {
  const raw = ctx.vars[unit as keyof VarBag];

  if (raw === undefined || raw === null || raw === '') {
    ctx.warn(`La regla usa la variable "${unit}", que no existe en este viaje: se tomó como 0.`);
    return ZERO;
  }

  const value = toDecimal(String(raw));
  if (value.isNaN()) {
    ctx.warn(`La variable "${unit}" no tiene un valor numérico ("${raw}"): se tomó como 0.`);
    return ZERO;
  }
  return value;
}

// Contexto de evaluación de una expresión.
export interface EvalContext {
  vars: VarBag;
  originZoneId: string;
  destZoneId: string;
  rateTables?: RateTable[];
  rateTableRows?: RateTableRow[];
  /** Avisa qué fila de qué tabla resolvió el monto, para poder explicarlo en el desglose. */
  recordTableMatch?: (match: RateTableMatch) => void;
  /** Subtotal (en ref) de una etapa: la final si ya se cerró, la parcial si es la etapa en curso. */
  getStageSubtotal: (stage: Stage) => Decimal;
  /** Subtotal acumulado (en ref) de todas las líneas evaluadas hasta el momento. */
  getRunningSubtotal: () => Decimal;
  /** Monto final (en ref) de una regla ya evaluada, o null si no existe o aún no se evaluó. */
  getRuleAmount: (ruleCode: string) => Decimal | null;
  warn: (message: string) => void;
}

// Evaluador puro de expresiones: misma Expr + mismo EvalContext -> mismo Decimal, siempre.
export function evaluateExpr(expr: Expr, ctx: EvalContext): Decimal {
  switch (expr.op) {
    case 'FIXED':
      return toDecimal(expr.amount);

    case 'PER_UNIT':
      return quantityOf(ctx, expr.unit).times(toDecimal(expr.rate));

    case 'PER_KM':
      return quantityOf(ctx, 'km').times(toDecimal(expr.rate));

    case 'PERCENT': {
      const base = resolveBase(expr.base, ctx);
      return base.times(toDecimal(expr.pct));
    }

    case 'TIERED': {
      const qty = quantityOf(ctx, expr.unit);
      const mode: TierMode = expr.mode ?? 'FLAT';

      if (mode === 'PROGRESSIVE') return progressiveAmount(qty, expr.tiers);

      const tier = findTier(qty, expr.tiers);
      if (!tier) {
        // Pasa cuando ningún tramo es abierto y la cantidad se pasa del último: la tabla tiene un
        // agujero. Se avisa y vale cero, en vez de romper toda la liquidación por una regla.
        ctx.warn(
          `Los escalones de esta regla no cubren el valor ${qty.toFixed(2)}. ` +
          'Dejá el último tramo sin límite superior para que cubra "de acá en adelante".',
        );
        return ZERO;
      }

      // FLAT: el tramo fija el importe. RATE: fija la tarifa de cada unidad.
      return mode === 'RATE' ? qty.times(toDecimal(tier.amount)) : toDecimal(tier.amount);
    }

    case 'PER_BLOCK': {
      if (expr.blockSize <= 0) {
        throw new Error('PER_BLOCK con blockSize 0 o negativo: no hay bloques que contar.');
      }
      // Solo bloques COMPLETOS: 25 peajes cada 10 son 2 bloques, no 2,5.
      const blocks = quantityOf(ctx, expr.unit).dividedBy(expr.blockSize).floor();
      return blocks.times(toDecimal(expr.amount));
    }

    case 'LOOKUP_TABLE': {
      const table = (ctx.rateTables ?? []).find((t) => t.code === expr.table && t.active);
      if (!table) {
        ctx.warn(`La regla busca en la tabla de tarifas "${expr.table}", que no existe o está inactiva: se usó la tarifa de respaldo.`);
        return evaluateExpr(expr.fallback, ctx);
      }

      // Una regla que pide una columna que el tarifario no tiene no puede leer nada: se avisa y va el respaldo.
      if (expr.column && !(table.valueColumns ?? []).includes(expr.column)) {
        ctx.warn(
          `La regla pide la columna "${expr.column}" del tarifario "${table.code}", que no la tiene: se usó la tarifa de respaldo.`,
        );
        return evaluateExpr(expr.fallback, ctx);
      }

      const found = lookupRateTable(table, ctx.rateTableRows ?? [], ctx.vars);
      if (!found) {
        const clave = table.keyColumns.map((c) => `${c}=${ctx.vars[c] ?? '(vacío)'}`).join(', ');
        ctx.warn(`La tabla "${table.code}" no tiene fila para ${clave}: se usó la tarifa de respaldo.`);
        return evaluateExpr(expr.fallback, ctx);
      }

      if (found.tiedWith.length > 0) {
        ctx.warn(
          `En la tabla "${table.code}" hay ${found.tiedWith.length + 1} filas igual de específicas para ` +
          `este viaje. Se aplicó "${found.match.matchedKey}"; agregá una columna a la clave o ajustá el ` +
          'orden si querés que gane otra.',
        );
      }

      // La columna elegida, o el valor principal. Una fila sin ese valor no cobra "0": avisa y usa el respaldo.
      let amount: string | undefined = found.row.amount;
      if (expr.column) {
        amount = found.row.values?.[expr.column];
        if (amount === undefined || amount === null || amount === '') {
          ctx.warn(
            `La fila "${found.match.matchedKey}" del tarifario "${table.code}" no tiene valor en la columna ` +
            `"${expr.column}": se usó la tarifa de respaldo.`,
          );
          return evaluateExpr(expr.fallback, ctx);
        }
      }

      ctx.recordTableMatch?.(expr.column ? { ...found.match, column: expr.column } : found.match);
      return toDecimal(amount);
    }

    case 'MIN':
      return decimalMin(expr.args.map((a) => evaluateExpr(a, ctx)));

    case 'MAX':
      return decimalMax(expr.args.map((a) => evaluateExpr(a, ctx)));

    case 'CLAMP': {
      let value = evaluateExpr(expr.value, ctx);
      if (expr.min !== undefined) value = decimalMax([value, toDecimal(expr.min)]);
      if (expr.max !== undefined) value = decimalMin([value, toDecimal(expr.max)]);
      return value;
    }

    case 'IF':
      return evaluatePred(expr.cond, ctx.vars) ? evaluateExpr(expr.then, ctx) : evaluateExpr(expr.else, ctx);
    default:
      // Éste era el peor de los tres. Sin rama por defecto, una expresión con un operador que el
      // kernel no conoce —o directamente vacía— devolvía `undefined`, que recién explotaba tres
      // marcos más adelante como "[DecimalError] Invalid argument: undefined", sin decir QUÉ regla
      // ni POR QUÉ, y se llevaba puesta la pantalla entera.
      throw new RuleShapeError(`operador desconocido "${(expr as { op?: string }).op ?? '(vacío)'}"`);
  }
}
