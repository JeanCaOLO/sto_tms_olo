// Lógica para emitir una liquidación nueva (primera vez).

import { db, UniqueViolationError } from '../data';
import { notLiquidableReason } from '../tripContext';
import { getTrip } from '../tripsDataSource';
import { auditar } from './audit';
import { buildRowValues } from './buildRowValues';
import { mapToDomain } from './mapToDomain';
import { nextNumber, newSettlementId } from './numberingAndIds';
import { resumen } from './summary';
import type { EmitSettlementResult, SettlementInput, TripRecord } from '../types';

export async function attemptEmit(input: SettlementInput, trip: TripRecord): Promise<EmitSettlementResult> {
  const motivo = notLiquidableReason(trip);
  if (motivo) return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: motivo }] };

  const ahora = new Date().toISOString();

  let saved;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      saved = await db().insert('settlement', {
        id: newSettlementId(),
        ...buildRowValues(input, trip, ahora),
        number: await nextNumber(trip.countryId),
        created_at: ahora,
      });
      break; // Éxito, salir del loop
    } catch (error) {
      lastError = error;
      // Si es UniqueViolationError en el primer intento, reintentar; de otro modo fallar
      if (!(error instanceof UniqueViolationError) || attempt >= 1) throw error;
      // Aguardar un poco antes de reintentar
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (!saved) throw lastError;

  await auditar('CREATE', String(saved.id), null, resumen(saved), undefined);
  return { status: 'saved', settlement: mapToDomain(saved) };
}

export async function validateAndReload(input: SettlementInput): Promise<EmitSettlementResult | null> {
  // Se relee el viaje: entre que se abrió la pantalla y se emite, pudo cambiar o liquidarse.
  const trip = await getTrip(input.trip.id);
  if (!trip) return { status: 'blocked', issues: [{ code: 'BASE_NO_DISPONIBLE', message: 'El viaje ya no existe.' }] };
  return null; // OK, viaje existe y puede recargarse
}
