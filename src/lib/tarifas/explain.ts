// "¿Por qué este total?"
//
// El motor produce todo lo necesario para responderlo y la interfaz lo tira:
//
//   - `line.inputs` guarda `{ km: 180, rate: '2.50' }` y **no se muestra en ninguna pantalla**.
//   - `line.runningSubtotal` es la columna que convierte una lista de importes en una cascada
//     auditable. Tampoco se muestra.
//   - `line.tableMatch` dice qué fila del tarifario ganó. Sin eso, "Tarifa de tabla" es un número
//     mágico.
//   - De cada descarte se muestra el detalle y **se tira el motivo**: tres historias distintas.
//
// Este módulo arma la estructura que responde la pregunta. PURO: no decide cómo se ve.

import { STAGE_LABELS } from './format';
import { STAGE_ORDER } from './types';
import type { CalcResult, Money } from './types';
import { explainLine, explainCost as explainCostLines, type ExplainContext, type ExplainedLine } from './explain/lines';
import { explainDiscards, type ExplainedDiscard } from './explain/discards';
import { variablesUsadas } from './explain/variables';

// Re-exportar para compatibilidad hacia atrás.
export { explainLine, type ExplainContext, type ExplainedLine } from './explain/lines';
export { explainDiscards, type ExplainedDiscard } from './explain/discards';
export { variablesUsadas } from './explain/variables';

export interface ExplainedStage {
  stage: string;
  label: string;
  lines: ExplainedLine[];
  subtotal: Money;
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

/**
 * La explicación completa.
 *
 * `excludedSeqs` son las líneas que el liquidador destildó: se muestran igual, tachadas, porque
 * haberlas quitado es parte de la historia del número.
 */
/**
 * El costo, con el mismo tratamiento.
 *
 * `cost.breakdown` ya es una lista de líneas con la misma forma que el desglose de cargo —fue
 * pensado así para poder reusar la vista—, y hoy no se abre en ninguna pantalla: se muestra sólo el
 * total. Con estructura de costos por filas, eso es la mitad de la historia del margen.
 */
export function explainCost(result: CalcResult): ExplainedLine[] {
  return explainCostLines(result);
}

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
