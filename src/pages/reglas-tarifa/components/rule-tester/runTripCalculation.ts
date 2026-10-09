import { calculateTrip } from '../../../../lib/tarifas/tripSettlement';
import type { TripContext, TripRecord } from '../../../../lib/tarifas/types';
import { mensajeDe, type Calculo } from './testerTypes';

type Finish = (calculo: Calculo | null, mensaje?: string) => void;

/** Calcula un viaje real completado (el mismo camino que la liquidación) y entrega el resultado a `terminar`. */
export function runTripCalculation(
  trip: TripRecord,
  customVars: TripContext['customVars'],
  isCurrent: () => boolean,
  terminar: Finish,
  onParty: (partyId: string | null) => void,
) {
  void calculateTrip(trip, { customVars }, { allowSettled: true })
    .then((r) => {
      if (!isCurrent()) return;
      if (r.status !== 'ok') { terminar(null, r.message); return; }
      const c = r.calculation;
      onParty(c.partyId);
      terminar({
        result: { ...c.result, warnings: c.warnings, blockingIssues: c.blockingIssues },
        trip: c.input.trip,
        rules: c.input.rules,
      });
    })
    .catch((e) => {
      console.error('Error en el probador del motor:', e);
      terminar(null, mensajeDe(e, 'No se pudo calcular el viaje.'));
    });
}
