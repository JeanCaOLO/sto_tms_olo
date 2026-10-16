// Pipeline de cálculo de cargos: recorre reglas y construye la traza completa.

import Decimal from 'decimal.js';
import type {
  CalcIssue, CalculateInput, Country, DiscardedRule, Money, Rule, Stage, TraceLine, VarBag,
} from '../types';
import { STAGE_ORDER } from '../types';
import { roundToMoney, toDecimal, ZERO } from '../money';
import { evaluateExpr, type EvalContext } from './expressions';
import { RuleShapeError } from './predicates';
import { detectRuleCycles } from './cycles';
import { extractInputs, resolveMaxGroup } from './pipelineHelpers';

export interface ChargeResult {
  trace: TraceLine[];
  stageSubtotals: Record<Stage, Money>;
  totalLiquidado: Money;
  warnings: string[];
  blockingIssues: CalcIssue[];
  /** Perdedores de los grupos MAX, que solo se conocen al evaluar con montos reales. */
  discarded: DiscardedRule[];
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
  /**
   * Líneas que ya forman parte del total antes de evaluar reglas: los gastos de la estructura de
   * costos de la flota propia. Entran como base (etapa BASE) y las reglas se acumulan sobre ellas.
   */
  seed?: { lines: TraceLine[] },
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

  // Las líneas sembradas ocupan el principio del desglose y arrancan el acumulado.
  for (const line of seed?.lines ?? []) {
    const amount = toDecimal(line.final);
    running = running.plus(amount);
    stageAccum.BASE = stageAccum.BASE.plus(amount);
    trace.push({ ...line, seq: trace.length + 1, stage: 'BASE', runningSubtotal: roundToMoney(running, country) });
  }

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

  let seq = trace.length;

  for (const rule of applied) {
    // Se reinicia por regla: cada línea informa la fila que resolvió SU monto.
    let tableMatch;

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
    const group = rule.stacking === 'MAX' && rule.exclusionGroup ? rule.exclusionGroup : null;
    if (group) {
      if (!maxWinners.has(group)) {
        maxWinners.set(group, resolveMaxGroup(group, applied, ctx, warnings, discarded));
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
      source: rule.isAdhoc ? 'ADHOC' : 'RULE',
      ruleScope: rule.scope ?? 'COUNTRY',
      rulePartyId: rule.partyId ?? null,
      ruleVersion: rule.version,
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
