// Qué proformas ve alguien en "Por aprobar": solo las que esperan SU decisión ahora, sin excepción de rol
// (tampoco los administradores). Una que ya aprobó, o que todavía está en una fase anterior, no le estorba:
// sigue disponible en "Todas".

import { canApprove } from './canApprove';
import { currentPhase } from './currentPhase';
import type { ProformaWithPhases } from './proformaQueries';
import type { PhaseActor } from './types';

export function isWaitingFor(row: ProformaWithPhases, actor: PhaseActor | null): boolean {
  const current = currentPhase(row.phases);
  return !!actor && row.proforma.status === 'En Revisión' && !!current && canApprove(actor, current, row.phases);
}

export function pendingForActor(rows: ProformaWithPhases[], actor: PhaseActor | null): ProformaWithPhases[] {
  return rows.filter((r) => isWaitingFor(r, actor));
}
