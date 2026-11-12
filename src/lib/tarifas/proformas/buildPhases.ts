// Copia las fases activas de la plantilla del país como snapshot de una proforma nueva.

import type { FlowPhaseTemplate, ProformaPhase } from './types';

export function buildPhases(proformaId: string, template: FlowPhaseTemplate[], newId: () => string): ProformaPhase[] {
  return template
    .filter((t) => t.active)
    .sort((a, b) => a.position - b.position)
    .map((t, index) => ({
      id: newId(),
      proformaId,
      position: index + 1,
      name: t.name,
      approverType: t.approverType,
      roleName: t.roleName,
      userId: t.userId,
      approverLabel: t.approverLabel,
      state: 'pendiente' as const,
      decidedBy: null,
      decidedAt: null,
      comment: null,
      removedBy: null,
    }));
}
