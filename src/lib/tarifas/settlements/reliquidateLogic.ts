// Lógica para re-liquidar un viaje (anular vigente, insertar nueva).

import { db, UniqueViolationError, type Row } from '../data';
import { notLiquidableReason } from '../tripContext';
import { getTrip } from '../tripsDataSource';
import { auditar } from './audit';
import { buildRowValues } from './buildRowValues';
import { mapToDomain } from './mapToDomain';
import { nextNumber, newSettlementId } from './numberingAndIds';
import { resumen } from './summary';
import type { EmitSettlementResult, SettlementInput } from '../types';

interface ValidationResult {
  error: string | null;
  errorType: 'invalid' | 'blocked' | 'failed' | null;
  actual: Row | null;
}

async function validateBeforeReliquiudate(currentId: string, input: SettlementInput, reason: string): Promise<ValidationResult> {
  if (!reason.trim()) {
    return { error: 'Indicá por qué se re-liquida el viaje.', errorType: 'invalid', actual: null };
  }

  const actual = await db().findOne('settlement', currentId);
  if (!actual) return { error: 'La liquidación a reemplazar ya no existe.', errorType: 'failed', actual: null };
  if (actual.status === 'Anulado') {
    return { error: 'Esa liquidación ya está anulada: no es la vigente del viaje.', errorType: 'blocked', actual: null };
  }
  if (actual.trip_id !== input.trip.id) {
    return { error: 'La liquidación a reemplazar es de otro viaje.', errorType: 'failed', actual: null };
  }

  const trip = await getTrip(input.trip.id);
  if (!trip) {
    return { error: 'El viaje ya no existe.', errorType: 'blocked', actual: null };
  }
  if (trip.status !== 'completed') {
    return { error: notLiquidableReason(trip) ?? 'El viaje no está completado.', errorType: 'blocked', actual: null };
  }

  return { error: null, errorType: null, actual };
}

export async function attemptReliquidate(
  currentId: string,
  input: SettlementInput,
  reason: string,
): Promise<EmitSettlementResult> {
  const validation = await validateBeforeReliquiudate(currentId, input, reason);
  if (validation.error) {
    if (validation.errorType === 'invalid') {
      return { status: 'invalid', errors: { notes: validation.error } };
    }
    if (validation.errorType === 'failed') {
      return { status: 'failed', error: { message: validation.error } };
    }
    return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: validation.error }] };
  }
  const actual = validation.actual!;

  const trip = (await getTrip(input.trip.id))!;
  const ahora = new Date().toISOString();

  let saved;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const newId = newSettlementId();
      const number = await nextNumber(trip.countryId);

      saved = await db().transaction(async (tx) => {
        // Primero se anula la vigente: libera el índice único "una vigente por viaje".
        await tx.update('settlement', currentId, {
          status: 'Anulado',
          superseded_by: newId,
          updated_at: ahora,
        });
        return tx.insert('settlement', {
          id: newId,
          ...buildRowValues(input, trip, ahora),
          number,
          created_at: ahora,
        });
      });

      await auditar('UPDATE', currentId, { status: actual.status }, { status: 'Anulado', superseded_by: newId }, reason);
      await auditar('CREATE', String(saved.id), null, resumen(saved), `Re-liquidación de ${actual.number}: ${reason}`);

      // El driver HTTP devuelve dentro de la transacción lo enviado; se relee la fila definitiva.
      const definitiva = await db().findOne('settlement', saved.id);
      return { status: 'saved', settlement: mapToDomain(definitiva ?? saved) };
    } catch (error) {
      lastError = error;
      // Si es UniqueViolationError en el primer intento, reintentar; de otro modo fallar
      if (!(error instanceof UniqueViolationError) || attempt >= 1) throw error;
      // Aguardar un poco antes de reintentar
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError;
}
