// Etiqueta de seguimiento para el monitor: en qué fase va la proforma y quién tiene que decidir.

import type { SettlementStatus } from '../types';
import { currentPhase } from './currentPhase';
import type { ProformaPhase } from './types';

export function phaseLabel(status: SettlementStatus, phases: ProformaPhase[]): string {
  if (status !== 'En Revisión') return status;
  const current = currentPhase(phases);
  if (!current) return status;
  const active = phases.filter((p) => p.state !== 'omitida');
  const index = active.findIndex((p) => p.id === current.id) + 1;
  return `En revisión · Fase ${index}/${active.length} – ${current.approverLabel}`;
}
