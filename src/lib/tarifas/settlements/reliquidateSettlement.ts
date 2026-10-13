// Re-liquidar un viaje.

import { failed, isNumberCollision } from './errorHandling';
import { attemptReliquidate } from './reliquidateLogic';
import { blockingIssues, validateSettlement } from './validation';
import type { EmitSettlementResult, SettlementInput } from '../types';

/**
 * Re-liquida un viaje: anula la liquidación vigente y emite una nueva con el cálculo actual, en UNA
 * transacción — o queda la vieja vigente, o queda la nueva; nunca las dos ni ninguna.
 *
 * La anulada conserva su snapshot y apunta a la nueva con `superseded_by`: así el historial del
 * viaje dice qué se pagó antes, qué se paga ahora y por qué cambió (`reason`).
 */
export async function reliquidateSettlement(
  currentId: string,
  input: SettlementInput,
  reason: string,
): Promise<EmitSettlementResult> {
  const issues = blockingIssues(input);
  if (issues.length > 0) return { status: 'blocked', issues };

  const errors = validateSettlement(input);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  try {
    return await attemptReliquidate(currentId, input, reason);
  } catch (error) {
    const isCollision = await isNumberCollision(error, input.trip.id);
    return failed(error, { isNumberCollision: isCollision });
  }
}
