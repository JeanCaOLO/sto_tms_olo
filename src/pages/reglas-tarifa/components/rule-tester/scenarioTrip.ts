import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import type { TripContext } from '../../../../lib/tarifas/types';
import type { DatosDelDia, ViajeLibre } from './testerTypes';

/** El viaje de un escenario guardado, expresado como el formulario del modo libre. */
export function libreFromScenarioTrip(t: TripContext, carriers: CarrierProfile[]): ViajeLibre {
  return {
    originZoneId: t.originLocationId,
    destZoneId: t.destLocationId,
    km: String(t.km),
    clientCount: String(t.clientCount),
    weightKg: String(t.weightKg),
    durationHours: String(t.durationHours),
    truckTypeId: t.truckTypeId,
    truckVolumeM3: String(t.truckVolumeM3),
    truckWeightTons: String(t.truckWeightTons),
    fleetType: t.fleetType,
    customerId: t.customerId ?? '',
    carrierId: carriers.find((c) => c.partyId && c.partyId === t.partyId)?.carrierId ?? '',
  };
}

/** Lo del día (fecha y servicio) de un escenario guardado. */
export function diaFromScenarioTrip(t: TripContext): DatosDelDia {
  return { quotedAt: t.quotedAt.slice(0, 10), serviceType: t.serviceType };
}

/** Las variables propias del escenario como texto, tal como se muestran en sus campos. */
export function customVarsAsText(t: TripContext): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(t.customVars ?? {})) vars[k] = String(v);
  return vars;
}
