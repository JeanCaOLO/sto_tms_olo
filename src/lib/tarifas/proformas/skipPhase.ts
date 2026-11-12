// Quitar (omitir) una fase pendiente de una proforma concreta. Solo superadministrador.

import { isSuperAdmin } from './isSuperAdmin';
import { resolveStatus } from './resolveStatus';
import type { PhaseActor, PhaseDecision, ProformaPhase } from './types';

export function skipPhase(phases: ProformaPhase[], phaseId: string, actor: PhaseActor, reason: string, now: string): PhaseDecision {
  if (!isSuperAdmin(actor.roleName)) throw new Error('Solo un superadministrador puede quitar fases de una proforma.');
  if (!reason.trim()) throw new Error('Indica el motivo para quitar la fase.');
  const phase = phases.find((p) => p.id === phaseId);
  if (!phase) throw new Error('La fase no existe en esta proforma.');
  if (phase.state !== 'pendiente') throw new Error('Solo se puede quitar una fase que sigue pendiente.');
  const next = phases.map((p) => (p.id === phaseId
    ? { ...p, state: 'omitida' as const, removedBy: actor.userName, decidedAt: now, comment: reason.trim() }
    : p));
  return { phases: next, status: resolveStatus(next) };
}
