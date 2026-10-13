// Detección de advertencias: empates de prioridad y otros casos.

import type { Rule, Stage } from '../types';
import { STAGE_ORDER } from '../types';

/** Detecta reglas con prioridades empatadas en la misma etapa. */
export function detectTieWarnings(winners: Rule[]): string[] {
  const warnings: string[] = [];
  for (const stage of STAGE_ORDER) {
    const porPrioridad = new Map<number, Rule[]>();
    for (const rule of winners.filter((r) => r.stage === stage)) {
      porPrioridad.set(rule.priority, [...(porPrioridad.get(rule.priority) ?? []), rule]);
    }
    for (const [priority, empatadas] of porPrioridad) {
      if (empatadas.length > 1) {
        warnings.push(
          `En la etapa ${stage} hay ${empatadas.length} reglas con prioridad ${priority} ` +
          `(${empatadas.map((r) => r.code).join(', ')}). Se aplican en orden alfabético por código; ` +
          'si el orden importa para el resultado, asignales prioridades distintas.',
        );
      }
    }
  }
  return warnings;
}
