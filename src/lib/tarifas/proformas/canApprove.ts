// ¿Este usuario puede decidir esta fase? Usuario específico o cualquiera con el rol requerido.
// El superadministrador NO decide por otros: solo puede quitar fases (ver `skipPhase`).

import { currentPhase } from './currentPhase';
import type { PhaseActor, ProformaPhase } from './types';

function sameText(a: string | null, b: string): boolean {
  return (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
}

export function canApprove(actor: PhaseActor, phase: ProformaPhase, phases: ProformaPhase[]): boolean {
  if (phase.state !== 'pendiente') return false;
  if (currentPhase(phases)?.id !== phase.id) return false;
  if (phase.approverType === 'user') return phase.userId === actor.userId;
  return sameText(phase.roleName, actor.roleName);
}
