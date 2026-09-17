// ¿CUÁNTO suma cada regla? Switch exhaustivo sobre los 10 operadores de Expr — sin eval, sin
// fórmulas como texto. También aloja runChargePipeline, que recorre las etapas en el orden fijo
// de STAGE_ORDER usando la lista de reglas ya resueltas por resolver.ts.
// Puerto literal de vista-tarifas-fase1/src/kernel/evaluator.ts.

import Decimal from 'decimal.js';
import type {
  BaseRef, CalcIssue, CalculateInput, Country, DiscardedRule, Expr, Money, Pred,
  RateTable, RateTableMatch, RateTableRow, Rule, Stage, Tier, TierMode, TraceLine, VarBag,
} from './types';
import { RATE_TABLE_WILDCARD, STAGE_ORDER } from './types';
import { roundToMoney, toDecimal, ZERO } from './money';

// ── Predicados — ¿aplica esta condición? ──────────────────────────────────────────────────────

function toComparableNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

// Igualdad tolerante a tipo: 40 (number) === "40" (string) cuando ambos son numéricos.
function looseEq(a: string | number, b: string | number): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    const an = toComparableNumber(a);
    const bn = toComparableNumber(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an === bn;
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
      return toComparableNumber(vars[pred.left]) > toComparableNumber(pred.right);
    case 'GTE':
      return toComparableNumber(vars[pred.left]) >= toComparableNumber(pred.right);
    case 'LT':
      return toComparableNumber(vars[pred.left]) < toComparableNumber(pred.right);
    case 'LTE':
      return toComparableNumber(vars[pred.left]) <= toComparableNumber(pred.right);
    case 'IN':
      return pred.values.some((v) => looseEq(vars[pred.left], v));
    case 'BETWEEN': {
      const n = toComparableNumber(vars[pred.left]);
      return n >= pred.from && n <= pred.to;
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

// ── Contexto de evaluación de una expresión ───────────────────────────────────────────────────

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

// ── Escalones ─────────────────────────────────────────────────────────────────────────────────

/**
 * Ordena los tramos de menor a mayor, con el abierto (`upTo: null`) al final.
 *
 * Es defensivo a propósito: si los tramos llegan desordenados, la búsqueda "el primero que cubre"
 * elige el equivocado y el importe sale mal sin ninguna señal. Ordenar acá hace que el resultado no
 * dependa del orden en que se escribieron ni del que devolvió la base.
 */
export function sortTiers(tiers: Tier[]): Tier[] {
  return [...tiers].sort((a, b) => {
    if (a.upTo === null) return 1;
    if (b.upTo === null) return -1;
    return a.upTo - b.upTo;
  });
}

/**
 * Escalón marginal: cada tramo cobra su tarifa solo por las unidades que caen DENTRO de él.
 * Es la forma en que se calcula un impuesto por tramos, y la que produce 425 en el ejemplo del
 * tipo `TierMode` mientras que `RATE` produce 375.
 */
export function progressiveAmount(qty: Decimal, tiers: Tier[]): Decimal {
  let total = ZERO;
  let lower = ZERO;

  for (const tier of sortTiers(tiers)) {
    // El tramo abierto se extiende hasta donde llegue la cantidad.
    const upper = tier.upTo === null ? qty : toDecimal(tier.upTo);
    const top = Decimal.min(qty, upper);
    const span = top.minus(lower);

    if (span.greaterThan(0)) total = total.plus(span.times(toDecimal(tier.amount)));

    lower = upper;
    if (qty.lessThanOrEqualTo(upper)) break;
  }

  return total;
}

/** Tramo que cubre una cantidad, ya con los tramos ordenados. */
function findTier(qty: Decimal, tiers: Tier[]): Tier | undefined {
  return sortTiers(tiers).find((t) => t.upTo === null || qty.lessThanOrEqualTo(t.upTo));
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

      ctx.recordTableMatch?.(found.match);
      return toDecimal(found.row.amount);
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

// ── Búsqueda en tablas de tarifas ─────────────────────────────────────────────────────────────

export interface RateTableLookup {
  row: RateTableRow;
  match: RateTableMatch;
  /** Otras filas que empataron en especificidad: la tabla es ambigua para este viaje. */
  tiedWith: RateTableRow[];
}

/**
 * Qué fila de la tabla corresponde a este viaje.
 *
 * Gana la MÁS ESPECÍFICA: la que resuelve más columnas con un valor exacto en vez de un comodín.
 * Es la convención de cualquier tabla de decisión y es lo que la gente espera ("la regla más
 * puntual manda sobre la general").
 *
 * El orden es TOTAL —especificidad, luego `order`, luego id— para que el resultado nunca dependa
 * del orden en que la base devolvió las filas. Cuando dos filas empatan en especificidad, el
 * desempate existe pero es arbitrario desde el punto de vista del negocio, así que se informa.
 */
export function lookupRateTable(
  table: RateTable,
  rows: RateTableRow[],
  vars: VarBag,
): RateTableLookup | null {
  const candidatas = rows
    .filter((row) => row.active && row.tableId === table.id)
    .filter((row) => table.keyColumns.every((column, i) => {
      const expected = row.key[i];
      if (expected === undefined || expected === RATE_TABLE_WILDCARD) return true;
      return looseEq(vars[column] ?? '', expected);
    }));

  if (candidatas.length === 0) return null;

  const especificidad = (row: RateTableRow): number =>
    table.keyColumns.reduce(
      (acc, _column, i) => acc + (row.key[i] && row.key[i] !== RATE_TABLE_WILDCARD ? 1 : 0),
      0,
    );

  const ordenadas = [...candidatas].sort((a, b) => {
    const porEspecificidad = especificidad(b) - especificidad(a);
    if (porEspecificidad !== 0) return porEspecificidad;
    const porOrden = a.order - b.order;
    if (porOrden !== 0) return porOrden;
    return a.id.localeCompare(b.id);
  });

  const ganadora = ordenadas[0]!;
  const maxEspecificidad = especificidad(ganadora);
  const tiedWith = ordenadas.slice(1).filter((row) => especificidad(row) === maxEspecificidad);

  return {
    row: ganadora,
    match: {
      tableCode: table.code,
      rowId: ganadora.id,
      matchedKey: table.keyColumns.map((_c, i) => ganadora.key[i] ?? RATE_TABLE_WILDCARD).join(' | '),
      specificity: maxEspecificidad,
    },
    tiedWith,
  };
}

// ── Ciclos entre reglas ───────────────────────────────────────────────────────────────────────

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

// ── Pipeline de cargo ──────────────────────────────────────────────────────────────────────────

export interface ChargeResult {
  trace: TraceLine[];
  stageSubtotals: Record<Stage, Money>;
  totalLiquidado: Money;
  warnings: string[];
  blockingIssues: CalcIssue[];
  /** Perdedores de los grupos MAX, que solo se conocen al evaluar con montos reales. */
  discarded: DiscardedRule[];
}

// Extrae las entradas relevantes de una regla para hacerla explicable en el desglose de la UI.
function extractInputs(rule: Rule, vars: VarBag): Record<string, string | number> {
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
      return { tabla: expr.table };
    case 'MIN':
    case 'MAX':
    case 'CLAMP':
    case 'IF':
      return {};
  }
}

// Recorre las reglas ya resueltas (ordenadas por resolver.ts por stage y priority) y construye la
// traza completa. Cada línea conoce el subtotal acumulado hasta ese punto para que las reglas
// PERCENT posteriores puedan usarlo como base.
export function runChargePipeline(
  applied: Rule[],
  vars: VarBag,
  originZoneId: string,
  destZoneId: string,
  input: Pick<
    CalculateInput,
    'country' | 'trip' | 'overrides' | 'rateTables' | 'rateTableRows'
  >,
): ChargeResult {
  const { country, trip, overrides = {} } = input;
  const rateTables = input.rateTables ?? [];
  const rateTableRows = input.rateTableRows ?? [];

  const stageAccum: Record<Stage, Decimal> = {
    BASE: ZERO, VARIABLE: ZERO, MODIFIER: ZERO, SURCHARGE: ZERO, ADJUSTMENT: ZERO, TAX: ZERO,
  };
  const ruleAmounts = new Map<string, Decimal>();
  let running = ZERO;
  const warnings: string[] = [];
  const blockingIssues: CalcIssue[] = [];
  const discarded: DiscardedRule[] = [];
  const trace: TraceLine[] = [];

  // Un ciclo de porcentajes da un total plausible pero equivocado, así que se detecta antes de
  // evaluar nada y frena la emisión.
  for (const cycle of detectRuleCycles(applied)) {
    blockingIssues.push({
      code: 'REFERENCIA_CIRCULAR',
      message: `Las reglas ${cycle.join(' → ')} se referencian en círculo: ninguna puede calcularse.`,
      ruleCode: cycle[0],
    });
  }

  // ── Grupos MAX ──────────────────────────────────────────────────────────────────────────────
  // Se resuelven acá y no en el resolver porque comparar montos exige los subtotales reales. Al
  // llegar al primer integrante de un grupo se evalúan todos con el contexto del momento, gana el
  // mayor y los demás quedan descartados con su motivo.
  const maxWinners = new Map<string, string>();
  const maxGroupOf = (rule: Rule): string | null =>
    rule.stacking === 'MAX' && rule.exclusionGroup ? rule.exclusionGroup : null;


  /**
   * Monto de un candidato de un grupo MAX.
   *
   * Una regla ilegible vale cero acá —no puede ganar una comparación que no se sabe hacer— pero el
   * aviso queda: si el grupo entero está roto, el total lo dirá al llegar a cada una.
   */
  const safeAmount = (rule: Rule, ctx: EvalContext): Decimal => {
    try {
      return evaluateExpr(rule.expression, ctx);
    } catch (e) {
      if (!(e instanceof RuleShapeError)) throw e;
      warnings.push(`La regla "${rule.code}" tiene una ${e.message}: no puede competir en su grupo MAX.`);
      return ZERO;
    }
  };

  let seq = 0;

  for (const rule of applied) {
    // Se reinicia por regla: cada línea informa la fila que resolvió SU monto.
    let tableMatch: RateTableMatch | undefined;

    const ctx: EvalContext = {
      vars,
      originZoneId,
      destZoneId,
      rateTables,
      rateTableRows,
      recordTableMatch: (match) => { tableMatch = match; },
      getStageSubtotal: (stage) => stageAccum[stage],
      getRunningSubtotal: () => running,
      getRuleAmount: (ruleCode) => {
        const amount = ruleAmounts.get(ruleCode);
        if (amount === undefined) {
          blockingIssues.push({
            code: 'BASE_NO_DISPONIBLE',
            message:
              `La regla "${rule.code}" calcula un porcentaje sobre "${ruleCode}", que todavía no se ` +
              'evaluó (o no aplica en este viaje). Movela a una etapa posterior o subile la prioridad.',
            ruleCode: rule.code,
          });
          return null;
        }
        return amount;
      },
      warn: (message) => warnings.push(message),
    };

    // Grupo MAX: la primera vez que aparece se decide el ganador con los montos reales.
    const group = maxGroupOf(rule);
    if (group) {
      if (!maxWinners.has(group)) {
        const candidates = applied
          .filter((r) => maxGroupOf(r) === group)
          .map((r) => ({ rule: r, amount: safeAmount(r, ctx) }));
        const winner = candidates.reduce((best, curr) =>
          curr.amount.greaterThan(best.amount) ? curr : best);
        maxWinners.set(group, winner.rule.code);

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
      }
      if (maxWinners.get(group) !== rule.code) continue;
    }

    let computed: Decimal;
    try {
      computed = evaluateExpr(rule.expression, ctx);
    } catch (e) {
      if (!(e instanceof RuleShapeError)) throw e;
      // Una regla ilegible NO puede simplemente omitirse: el total saldría de menos y nadie lo
      // notaría. Se descarta nombrándola y se frena la emisión hasta que alguien la arregle.
      discarded.push({
        ruleCode: rule.code,
        reason: 'RULE_BROKEN',
        detail: `No se pudo leer: ${e.message}. Revisá su expresión en modo avanzado.`,
      });
      blockingIssues.push({
        code: 'REGLA_ILEGIBLE',
        message: `La regla "${rule.code}" (${rule.name}) tiene una ${e.message} y no se pudo calcular. `
          + 'El total está incompleto hasta que se corrija.',
        ruleCode: rule.code,
      });
      continue;
    }

    // El efecto declarado tiene que coincidir con lo que la regla hace de verdad. Se puede
    // desincronizar editando la expresión en modo avanzado sin tocar el efecto.
    if (rule.effect && !computed.isZero()) {
      const sube = computed.isPositive();
      if ((rule.effect === 'INCREASE') !== sube) {
        warnings.push(
          `La regla "${rule.code}" está marcada como "${rule.effect === 'INCREASE' ? 'aumenta' : 'disminuye'} el costo" ` +
          `pero su importe ${sube ? 'suma' : 'resta'}. Revisá el signo de la expresión.`,
        );
      }
    }
    // El override lo tipea una persona mirando la pantalla: entra tal cual, sin transformación.
    const override = overrides[rule.code];
    const final = override ? toDecimal(override.value) : computed;

    // running/stageAccum acumulan el Decimal exacto, sin redondear — el único punto de redondeo
    // real es roundToMoney, aplicado más abajo solo a stageSubtotals/totalLiquidado y a las líneas
    // del trace (que son puramente de presentación).
    running = running.plus(final);
    stageAccum[rule.stage] = stageAccum[rule.stage].plus(final);
    ruleAmounts.set(rule.code, final);

    seq += 1;
    const line: TraceLine = {
      seq,
      stage: rule.stage,
      ruleId: rule.isAdhoc ? null : rule.id,
      ruleCode: rule.code,
      label: rule.name,
      inputs: extractInputs(rule, vars),
      computed: roundToMoney(computed, country),
      final: roundToMoney(final, country),
      runningSubtotal: roundToMoney(running, country),
    };
    if (tableMatch) line.tableMatch = tableMatch;
    trace.push(override ? { ...line, override } : line);
  }

  const stageSubtotals = Object.fromEntries(
    STAGE_ORDER.map((stage) => [stage, roundToMoney(stageAccum[stage], country)]),
  ) as Record<Stage, Money>;

  const totalLiquidado = roundToMoney(running, country);

  // Un total negativo significa que el transportista le debe plata a la empresa. Casi siempre es un
  // error de carga, así que frena la emisión salvo que el país lo habilite explícitamente.
  if (running.isNegative() && !country.allowNegativeTotal) {
    blockingIssues.push({
      code: 'TOTAL_NEGATIVO',
      message:
        `El total da ${totalLiquidado} ${country.localCurrency}: los descuentos superan a los cargos. ` +
        'Revisá las reglas de ajuste, o habilitá los totales negativos para este país si es intencional.',
    });
  }

  return {
    trace,
    stageSubtotals,
    totalLiquidado,
    warnings,
    blockingIssues,
    discarded,
  };
}
