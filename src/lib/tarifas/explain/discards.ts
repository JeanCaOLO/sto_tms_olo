// Explicación de reglas descartadas agrupadas por motivo.

import { DISCARD_REASON_LABELS } from '../format';
import type { DiscardReason, DiscardedRule } from '../types';

export interface ExplainedDiscard {
  reason: DiscardReason;
  reasonLabel: string;
  rules: { ruleCode: string; detail: string }[];
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
