// "¿Por qué este total?"
//
// El motor produce todo lo necesario para responderlo y la interfaz lo tira:
//
//   - `line.inputs` guarda `{ km: 180, rate: '2.50' }` y **no se muestra en ninguna pantalla**.
//     `formatInputs`, escrita justamente para eso, no tiene un solo consumidor.
//   - `line.runningSubtotal` es la columna que convierte una lista de importes en una cascada
//     auditable, y la única forma de entender un porcentaje sobre el acumulado. Tampoco se muestra.
//   - `line.tableMatch` dice qué fila del tarifario ganó. Sin eso, "Tarifa de tabla" es un número
//     mágico.
//   - De cada descarte se muestra el detalle y **se tira el motivo**: "no se cumplió la condición",
//     "fuera de vigencia" y "reemplazada por la compañía" son tres historias distintas.
//
// Este módulo arma la estructura que responde la pregunta. PURO: no decide cómo se ve.

import { DISCARD_REASON_LABELS, STAGE_LABELS, formatInputs, formatPred, varLabel } from './format';
import { STAGE_ORDER } from './types';
import type {
  CalcResult, DiscardReason, DiscardedRule, Money, Rule, Stage, TraceLine, VarKey,
} from './types';

export interface ExplainContext {
  /** Reglas del catálogo más las ad-hoc, para poder decir POR QUÉ aplicó cada una. */
  rules: Rule[];
  /** Etiqueta legible de cada variable personalizada. */
  customLabels?: Record<string, string>;
}

export interface ExplainedLine {
  seq: number;
  stage: Stage;
  stageLabel: string;
  ruleCode: string;
  label: string;
  /** La condición en castellano: "Zona de origen = CCS y Zona de destino = CAR". */
  porQue: string | null;
  /** Cómo se llegó al número: "180 × 2.50". */
  como: string;
  /** De dónde salió el importe, cuando no es la regla sola. */
  fuente: string | null;
  monto: Money;
  acumulado: Money;
  /** Corregido a mano, con su motivo. */
  override: { value: Money; reason: string } | null;
  /** Destildada por el liquidador: no entra en el total. */
  excluida: boolean;
}

export interface ExplainedStage {
  stage: Stage;
  label: string;
  lines: ExplainedLine[];
  subtotal: Money;
}

export interface ExplainedDiscard {
  reason: DiscardReason;
  reasonLabel: string;
  rules: { ruleCode: string; detail: string }[];
}

export interface Explanation {
  stages: ExplainedStage[];
  total: Money;
  currency: string;
  /** Qué números del viaje entraron de verdad en el cálculo. */
  variablesUsadas: { key: string; label: string; value: string }[];
  /** Descartes AGRUPADOS por motivo: tres historias distintas, no una lista plana. */
  discards: ExplainedDiscard[];
  warnings: string[];
  blocking: { code: string; message: string }[];
}

/** Explica UNA línea del desglose. */
export function explainLine(
  line: TraceLine,
  ctx: ExplainContext,
  excluida = false,
): ExplainedLine {
  const rule = ctx.rules.find((r) => r.code === line.ruleCode);

  // La descripción escrita por el usuario gana sobre la reconstruida: está en castellano y dice el
  // porqué de negocio, no la mecánica.
  const como = rule?.description?.trim() || formatInputs(line.inputs);

  const fuente = line.tableMatch
    ? `Tarifario ${line.tableMatch.tableCode}, fila "${line.tableMatch.matchedKey}"`
    : null;

  return {
    seq: line.seq,
    stage: line.stage,
    stageLabel: STAGE_LABELS[line.stage] ?? line.stage,
    ruleCode: line.ruleCode,
    label: line.label,
    porQue: rule ? formatPred(rule.conditions, ctx.customLabels) : null,
    como,
    fuente,
    monto: line.final,
    acumulado: line.runningSubtotal,
    override: line.override ? { value: line.override.value, reason: line.override.reason } : null,
    excluida,
  };
}

/** Agrupa los descartes por motivo. */
export function explainDiscards(discarded: DiscardedRule[]): ExplainedDiscard[] {
  const porMotivo = new Map<DiscardReason, { ruleCode: string; detail: string }[]>();

  for (const d of discarded) {
    const lista = porMotivo.get(d.reason) ?? [];
    lista.push({ ruleCode: d.ruleCode, detail: d.detail });
    porMotivo.set(d.reason, lista);
  }

  return [...porMotivo.entries()].map(([reason, rules]) => ({
    reason,
    reasonLabel: DISCARD_REASON_LABELS[reason] ?? reason,
    rules,
  }));
}

/**
 * Qué números del viaje entraron en el cálculo.
 *
 * Es la unión de los `inputs` de todas las líneas aplicadas, o sea exactamente los datos que
 * MIRÓ el motor. Lo que no está acá no influyó en el total — y saber eso es la mitad de una
 * auditoría: "cargué el peso y no cambió nada" tiene una respuesta concreta.
 */
export function variablesUsadas(
  trace: TraceLine[],
  customLabels: Record<string, string> = {},
): { key: string; label: string; value: string }[] {
  const vistas = new Map<string, string>();

  for (const line of trace) {
    for (const [key, value] of Object.entries(line.inputs)) {
      // `rate`, `amount`, `pct` y `cada` son parámetros de la REGLA, no datos del viaje.
      if (['rate', 'amount', 'pct', 'base', 'cada', 'tabla', 'driver', 'unidades', 'importe'].includes(key)) continue;
      if (!vistas.has(key)) vistas.set(key, String(value));
    }
  }

  return [...vistas.entries()].map(([key, value]) => ({
    key,
    label: varLabel(key as VarKey, customLabels),
    value,
  }));
}

/**
 * La explicación completa.
 *
 * `excludedSeqs` son las líneas que el liquidador destildó: se muestran igual, tachadas, porque
 * haberlas quitado es parte de la historia del número.
 */
export function explainResult(
  result: CalcResult,
  ctx: ExplainContext,
  options: { excludedSeqs?: Iterable<number>; total?: Money } = {},
): Explanation {
  const excluidas = new Set(options.excludedSeqs ?? []);

  const stages: ExplainedStage[] = STAGE_ORDER
    .map((stage) => ({
      stage,
      label: STAGE_LABELS[stage] ?? stage,
      lines: result.trace
        .filter((l) => l.stage === stage)
        .map((l) => explainLine(l, ctx, excluidas.has(l.seq))),
      subtotal: result.stageSubtotals[stage],
    }))
    .filter((s) => s.lines.length > 0);

  return {
    stages,
    total: options.total ?? result.totalLiquidado,
    currency: result.currency,
    variablesUsadas: variablesUsadas(result.trace, ctx.customLabels),
    discards: explainDiscards(result.discarded),
    warnings: result.warnings,
    blocking: result.blockingIssues.map((i) => ({ code: i.code, message: i.message })),
  };
}

/**
 * El costo, con el mismo tratamiento.
 *
 * `cost.breakdown` ya es una lista de líneas con la misma forma que el desglose de cargo —fue
 * pensado así para poder reusar la vista—, y hoy no se abre en ninguna pantalla: se muestra sólo el
 * total. Con estructura de costos por filas, eso es la mitad de la historia del margen.
 */
export function explainCost(result: CalcResult): ExplainedLine[] {
  return result.cost.breakdown.map((line) => ({
    seq: line.seq,
    stage: line.stage,
    stageLabel: 'Costo',
    ruleCode: line.ruleCode,
    label: line.label,
    porQue: null,
    como: formatInputs(line.inputs),
    fuente: null,
    monto: line.final,
    acumulado: line.runningSubtotal,
    override: null,
    excluida: false,
  }));
}
