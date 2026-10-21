// Qué proformas ve alguien en "Por aprobar": solo las que esperan SU decisión ahora. Una que ya aprobó, o que
// todavía está en una fase anterior, no le estorba (sigue disponible en "Todas"). Quien administra el flujo
// (puede quitar fases) ve todas las que están en revisión para poder supervisarlas.

import { canApprove } from './canApprove';
import { currentPhase } from './currentPhase';
import { isSuperAdmin } from './isSuperAdmin';
import type { ProformaWithPhases } from './proformaQueries';
import type { PhaseActor } from './types';

export function isWaitingFor(row: ProformaWithPhases, actor: PhaseActor | null): boolean {
  const current = currentPhase(row.phases);
  return !!actor && row.proforma.status === 'En Revisión' && !!current && canApprove(actor, current, row.phases);
}

export function pendingForActor(rows: ProformaWithPhases[], actor: PhaseActor | null): ProformaWithPhases[] {
  if (isSuperAdmin(actor?.roleName)) return rows.filter((r) => r.proforma.status === 'En Revisión');
  return rows.filter((r) => isWaitingFor(r, actor));
}
