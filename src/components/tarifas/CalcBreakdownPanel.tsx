// "¿Por qué este total?"
//
// Es la vista que faltaba. El motor producía todo lo necesario para responder la pregunta y ninguna
// pantalla lo mostraba: las cantidades que entraron en cada línea, el acumulado, qué fila del
// tarifario ganó, el motivo de cada descarte. La función escrita para formatear eso no tenía un
// solo consumidor.
//
// Tres niveles plegables, porque hay tres lectores distintos:
//   1. RESUMEN    — un renglón por etapa. Lo que mira quien sólo va a firmar.
//   2. DETALLE    — regla por regla: por qué aplicó, cómo se calculó, cuánto, acumulado.
//   3. AUDITORÍA  — qué NO aplicó y por qué, qué números miró el motor, el costo y el margen.
//
// Vive en `components/tarifas/` porque lo usan el alta de liquidación y el Probador: si el Probador
// mostrara otra cosa, volveríamos al problema de dos pantallas que no coinciden.

import { useState } from 'react';
import { explainResult, type ExplainContext, type ExplainedLine } from '../../lib/tarifas/explain';
import type { CalcResult, Money } from '../../lib/tarifas/types';
import { LevelSelector } from './CalcBreakdownPanelLevels';
import { AllocationBlock } from './breakdown/AllocationBlock';
import { AuditSection } from './breakdown/AuditSection';
import { BlockingNotice } from './breakdown/BlockingNotice';
import { LineDetailTable } from './breakdown/LineDetailTable';
import { StageSummaryTable } from './breakdown/StageSummaryTable';
import { WarningsNotice } from './breakdown/WarningsNotice';
import type { Nivel } from './breakdown/breakdownLabels';

export { AllocationBlock };

interface Props {
  result: CalcResult;
  ctx: ExplainContext;
  excludedSeqs?: Iterable<number>;
  total?: Money;
  onToggleLine?: (seq: number) => void;
  hrefFor?: (origin: ExplainedLine['origen']) => string | null;
  fixedLevel?: Nivel;
}

export default function CalcBreakdownPanel({
  result, ctx, excludedSeqs, total, onToggleLine, hrefFor, fixedLevel,
}: Props) {
  const [nivelElegido, setNivel] = useState<Nivel>('detalle');
  const nivel = fixedLevel ?? nivelElegido;

  const explicacion = explainResult(result, ctx, { excludedSeqs, total });
  const moneda = explicacion.currency;

  const difiere = total !== undefined && total !== result.totalLiquidado;
  const countryOverridden = new Set(
    result.discarded.filter((d) => d.reason === 'OVERRIDDEN_BY_PARTY').map((d) => d.ruleCode),
  );
  const showDetail = (nivel === 'detalle' || nivel === 'auditoria') && explicacion.stages.length > 0;

  return (
    <div className="space-y-4">
      <BlockingNotice blocking={explicacion.blocking} />

      {!fixedLevel && <LevelSelector nivel={nivel} setNivel={setNivel} />}

      <StageSummaryTable
        explicacion={explicacion}
        moneda={moneda}
        motorTotal={difiere ? result.totalLiquidado : null}
      />

      {showDetail && (
        <LineDetailTable
          explicacion={explicacion}
          moneda={moneda}
          countryOverridden={countryOverridden}
          onToggleLine={onToggleLine}
          hrefFor={hrefFor}
        />
      )}

      {nivel === 'auditoria' && <AuditSection explicacion={explicacion} result={result} moneda={moneda} />}

      {fixedLevel !== 'resumen' && explicacion.warnings.length > 0 && (
        <WarningsNotice warnings={explicacion.warnings} />
      )}
    </div>
  );
}
