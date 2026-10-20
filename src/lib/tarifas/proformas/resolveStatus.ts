// Estado de la proforma según sus fases. Sin fases pendientes ni rechazadas queda Aprobado.

import type { SettlementStatus } from '../types';
import type { ProformaPhase } from './types';

export function resolveStatus(phases: ProformaPhase[]): SettlementStatus {
  if (phases.some((p) => p.state === 'rechazada')) return 'Borrador';
  if (phases.some((p) => p.state === 'pendiente')) return 'En Revisión';
  return 'Aprobado';
}
