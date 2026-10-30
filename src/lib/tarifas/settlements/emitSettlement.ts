// Emitir una liquidación nueva.

import { autoAssignSettlement } from '../proformas/autoAssign';
import { stampClaimOrigin } from '../proformas/claimOrigin';
import { getTrip } from '../tripsDataSource';
import { failed, isNumberCollision } from './errorHandling';
import { attemptEmit } from './emitLogic';
import { blockingIssues, validateSettlement } from './validation';
import type { EmitSettlementResult, SettlementInput } from '../types';

/**
 * Emite la PRIMERA liquidación de un viaje.
 *
 * Devuelve `'blocked'` —y no `'invalid'`— cuando el motor detectó algo que hace que el total no sea
 * confiable, cuando la política de margen lo impide, o cuando el viaje ya no se puede liquidar
 * (dejó de estar completado, o alguien lo liquidó mientras tanto). Son cosas que no arregla quien
 * completa el formulario.
 */
export async function emitSettlement(input: SettlementInput): Promise<EmitSettlementResult> {
  const issues = blockingIssues(input);
  if (issues.length > 0) return { status: 'blocked', issues };

  const errors = validateSettlement(input);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  try {
    // Se relee el viaje: entre que se abrió la pantalla y se emite, pudo cambiar o liquidarse.
    const trip = await getTrip(input.trip.id);
    if (!trip) return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: 'El viaje ya no existe.' }] };

    const result = await attemptEmit(input, trip);
    // La proforma se genera sola: la liquidación entra a la abierta de su transportista (o abre una).
    if (result.status === 'saved') {
      await stampClaimOrigin(result.settlement.id, input.trip.id);
      await autoAssignSettlement(result.settlement);
    }
    return result;
  } catch (error) {
    const isCollision = await isNumberCollision(error, input.trip.id);
    return failed(error, { isNumberCollision: isCollision });
  }
}
