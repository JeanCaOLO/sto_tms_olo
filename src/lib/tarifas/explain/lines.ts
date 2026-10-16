// Explicación de líneas individuales del desglose.

import { STAGE_LABELS, formatInputs, formatPred, varLabel } from '../format';
import type {
  TraceLine, TraceSource, Money, Rule, CalcResult,
} from '../types';

export interface ExplainContext {
  /** Reglas del catálogo más las ad-hoc, para poder decir POR QUÉ aplicó cada una. */
  rules: Rule[];
  /** Etiqueta legible de cada variable personalizada. */
  customLabels?: Record<string, string>;
}

export interface ExplainedLine {
  seq: number;
  stage: string;
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
  /** Dónde está la línea para editarla: la regla (id), el alcance, la compañía o el tipo de costo. */
  origen: {
    source: TraceSource | null;
    ruleId: string | null;
    scope: 'COUNTRY' | 'PARTY' | null;
    partyId: string | null;
    version: number | null;
    tableId: string | null;
  };
}

/** Explica UNA línea del desglose. */
export function explainLine(
  line: TraceLine,
  ctx: ExplainContext,
  excluida = false,
): ExplainedLine {
  // Por id: el código se repite cuando una regla de compañía reemplaza a la de país (mismo código,
  // dos reglas), y buscar solo por código podía explicar la línea con la regla equivocada.
  const rule = (line.ruleId ? ctx.rules.find((r) => r.id === line.ruleId) : undefined)
    ?? ctx.rules.find((r) => r.code === line.ruleCode && (r.scope ?? 'COUNTRY') === (line.ruleScope ?? r.scope ?? 'COUNTRY'));

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
    origen: {
      source: line.source ?? null,
      ruleId: line.ruleId,
      scope: line.ruleScope ?? null,
      partyId: line.rulePartyId ?? null,
      version: line.ruleVersion ?? null,
      tableId: line.tableMatch?.tableId ?? null,
    },
  };
}

/** El costo, con el mismo tratamiento. */
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
    origen: { source: line.source ?? null, ruleId: null, scope: null, partyId: null, version: null, tableId: null },
  }));
}
