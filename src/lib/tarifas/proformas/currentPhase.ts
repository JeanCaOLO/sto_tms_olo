// Fase en curso de una proforma: la primera, por orden, que aún está pendiente.

import type { ProformaPhase } from './types';

export function currentPhase(phases: ProformaPhase[]): ProformaPhase | null {
  const ordered = [...phases].sort((a, b) => a.position - b.position);
  return ordered.find((p) => p.state === 'pendiente') ?? null;
}
