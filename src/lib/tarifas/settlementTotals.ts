// El total de una liquidación cuando el liquidador destildó líneas.
//
// Existe por dos motivos concretos:
//
// 1. **Estaba calculado en dos lugares.** El modal sumaba las líneas marcadas para el total, y
//    ACUMULABA POR SEPARADO los subtotales por etapa para mostrarlos. Dos recorridos sobre los
//    mismos datos que pueden desincronizarse en cuanto uno de los dos cambie.
// 2. **Usaba coma flotante.** `reduce((s, l) => s + Number(l.final), 0)` y después `toFixed(2)`:
//    el resto del módulo trabaja con decimales exactos justamente para no perder centavos acá.
//
// Módulo PURO.

import { addAll, roundToMoney, toDecimal } from './money';
import { STAGE_ORDER } from './types';
import type { CalcResult, Country, Money, Stage, TraceLine } from './types';

export interface SettlementTotals {
  /** Lo que se paga: sólo las líneas incluidas. */
  total: Money;
  /** Subtotal por etapa, contando sólo las líneas incluidas. */
  stageSubtotals: Record<Stage, Money>;
  /** Cuánto se restó al destildar. Positivo = el total bajó. */
  excludedAmount: Money;
  includedCount: number;
  excludedCount: number;
}

/**
 * Total y subtotales a partir de las líneas que quedaron incluidas.
 *
 * `excludedSeqs` son las que el liquidador destildó. Con el conjunto vacío el resultado es el del
 * motor, línea por línea.
 */
export function computeSettlementTotals(
  trace: TraceLine[],
  excludedSeqs: Iterable<number>,
  country: Country,
): SettlementTotals {
  const excluidas = new Set(excludedSeqs);

  const incluidas = trace.filter((l) => !excluidas.has(l.seq));
  const fuera = trace.filter((l) => excluidas.has(l.seq));

  const stageSubtotals = Object.fromEntries(
    STAGE_ORDER.map((stage) => [
      stage,
      roundToMoney(
        addAll(incluidas.filter((l) => l.stage === stage).map((l) => toDecimal(l.final))),
        country,
      ),
    ]),
  ) as Record<Stage, Money>;

  return {
    total: roundToMoney(addAll(incluidas.map((l) => toDecimal(l.final))), country),
    stageSubtotals,
    excludedAmount: roundToMoney(addAll(fuera.map((l) => toDecimal(l.final))), country),
    includedCount: incluidas.length,
    excludedCount: fuera.length,
  };
}

/**
 * ¿Destildar líneas cambió el total respecto de lo que dictó el motor?
 *
 * La pantalla lo usa para mostrar la diferencia en vez de sólo el número final: un total que no
 * coincide con el del motor tiene que verse, porque es una decisión de una persona y no del
 * cálculo.
 */
export function differsFromEngine(totals: SettlementTotals, result: CalcResult): boolean {
  return totals.total !== result.totalLiquidado;
}
