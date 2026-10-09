// Manejo de errores en liquidaciones.

import { db, UniqueViolationError } from '../data';
import type { EmitSettlementResult } from '../types';

export function failed(error: unknown, context?: { isNumberCollision?: boolean }): EmitSettlementResult {
  if (error instanceof UniqueViolationError) {
    // Si es una colisión de número de liquidación, devolver mensaje específico
    if (context?.isNumberCollision) {
      return {
        status: 'blocked',
        issues: [{ code: 'BASE_NO_DISPONIBLE', message: 'No se pudo asignar el número de liquidación: intenta de nuevo en un momento.' }],
      };
    }
    return {
      status: 'blocked',
      issues: [{ code: 'BASE_NO_DISPONIBLE', message: error.message }],
    };
  }
  return { status: 'failed', error: { message: error instanceof Error ? error.message : String(error) } };
}

/**
 * Una violación de unicidad puede ser el número `LIQ-` (dos personas emitiendo a la vez) o "ya hay
 * una liquidación vigente para este viaje". Solo es colisión de número si el viaje NO tiene una
 * vigente: si la tiene, el mensaje original del error es el correcto.
 */
export async function isNumberCollision(error: unknown, tripId: string): Promise<boolean> {
  if (!(error instanceof UniqueViolationError)) return false;
  try {
    const rows = await db().find('settlement', { where: [{ column: 'trip_id', op: 'eq', value: tripId }] });
    return !rows.some((r) => r.status !== 'Anulado');
  } catch {
    return false;
  }
}
