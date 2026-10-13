// Validación de transiciones de estado de liquidación.

import { db } from '../data';
import type { SettlementStatus } from '../types';

const ALLOWED_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  'Borrador': ['En Revisión', 'Aprobado', 'Pagado', 'Anulado'],
  'En Revisión': ['Borrador', 'Aprobado', 'Pagado', 'Anulado'],
  'Aprobado': ['Pagado', 'Anulado', 'En Revisión'],
  'Pagado': ['Anulado'],
  'Anulado': [],
};

export async function updateStatus(
  id: string,
  status: SettlementStatus,
  options?: { marginReason?: string },
): Promise<{ error: string | null }> {
  try {
    const actual = await db().findOne('settlement', id);
    if (!actual) return { error: 'La liquidación ya no existe.' };

    // Primero verificar si fue reemplazada (tiene precedencia sobre las transiciones)
    if (actual.superseded_by && status !== 'Anulado') {
      return { error: 'Esta liquidación fue reemplazada al re-liquidar el viaje: no se puede reactivar.' };
    }

    const currentStatus = actual.status as SettlementStatus;
    const allowedTargets = ALLOWED_TRANSITIONS[currentStatus] ?? [];

    if (!allowedTargets.includes(status)) {
      return {
        error: `No se puede pasar de "${currentStatus}" a "${status}". Transición no permitida.`
      };
    }

    await db().update('settlement', id, {
      status,
      ...(options?.marginReason ? { margin_reason: options.marginReason } : {}),
      updated_at: new Date().toISOString(),
    });

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
