// "Probar": evalúa la expresión del cálculo simple con un valor de ejemplo y muestra el importe.

import { useState } from 'react';
import Decimal from 'decimal.js';
import { evaluateExpr } from '../../../../lib/tarifas/evaluator';
import { compileBuilder } from '../../../../lib/tarifas/rule-builder';
import type { RuleBuilderForm } from '../../../../lib/tarifas/types';

type EvalVars = Parameters<typeof evaluateExpr>[1]['vars'];

export function useRuleProbe(builder: RuleBuilderForm, currencyLabel: string) {
  const [probeValue, setProbeValue] = useState('10');
  const [probeResult, setProbeResult] = useState<string | null>(null);

  const runProbe = () => {
    try {
      const subtotal = () => new Decimal(100);
      const amount = evaluateExpr(compileBuilder(builder), {
        vars: { [builder.variable ?? 'km']: Number(probeValue) || 0 } as EvalVars,
        originZoneId: '',
        destZoneId: '',
        getStageSubtotal: subtotal,
        getRunningSubtotal: subtotal,
        getRuleAmount: subtotal,
        warn: () => {},
      });
      setProbeResult(`${amount.toFixed(2)} ${currencyLabel}`);
    } catch (error) {
      setProbeResult(error instanceof Error ? error.message : 'No se pudo calcular');
    }
  };

  return { probeValue, setProbeValue, probeResult, setProbeResult, runProbe };
}
