// Decisión sobre una fase (aprobar o rechazar). Funciones puras: devuelven fases nuevas y estado.

import { canApprove } from './canApprove';
import { resolveStatus } from './resolveStatus';
import type { PhaseActor, PhaseDecision, ProformaPhase } from './types';

interface DecisionInput {
  phaseId: string;
  actor: PhaseActor;
  state: 'aprobada' | 'rechazada';
  comment: string | null;
  now: string;
}

function decide(phases: ProformaPhase[], input: DecisionInput): PhaseDecision {
  const { phaseId, actor, state, comment, now } = input;
  const phase = phases.find((p) => p.id === phaseId);
  if (!phase) throw new Error('La fase no existe en esta proforma.');
  if (!canApprove(actor, phase, phases)) throw new Error('No puedes decidir esta fase: no es tu turno o no tienes el rol requerido.');
  if (state === 'rechazada' && !comment?.trim()) throw new Error('Para rechazar indica el motivo.');
  const next = phases.map((p) => (p.id === phaseId
    ? { ...p, state, decidedBy: actor.userName, decidedAt: now, comment: comment?.trim() || null }
    : p));
  return { phases: next, status: resolveStatus(next) };
}

export function approvePhase(phases: ProformaPhase[], phaseId: string, actor: PhaseActor, comment: string | null, now: string): PhaseDecision {
  return decide(phases, { phaseId, actor, state: 'aprobada', comment, now });
}

export function rejectPhase(phases: ProformaPhase[], phaseId: string, actor: PhaseActor, comment: string | null, now: string): PhaseDecision {
  return decide(phases, { phaseId, actor, state: 'rechazada', comment, now });
}
