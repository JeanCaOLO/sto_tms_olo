import { calculate } from '../../../../lib/tarifas';
import type { TarifasCatalog } from '../../../../lib/tarifas/catalogLoader';
import { buildCalculateInput } from '../../../../lib/tarifas/settlementInput';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import type { FleetType, TripContext } from '../../../../lib/tarifas/types';
import type { Calculo, DatosDelDia, ViajeLibre } from './testerTypes';

/** Arma el viaje del modo libre a partir de lo tecleado; la flota la define la compañía si hay una. */
export function buildFreeTrip(
  libre: ViajeLibre,
  dia: DatosDelDia,
  libreCarrier: CarrierProfile | null,
  countryId: string,
  customVars: TripContext['customVars'],
): TripContext {
  const fleetType: FleetType = libreCarrier
    ? (libreCarrier.classification === 'OWN' ? 'OWN' : 'OUTSOURCED')
    : libre.fleetType;
  return {
    countryId,
    partyId: libreCarrier?.partyId ?? null,
    quotedAt: new Date(dia.quotedAt).toISOString(),
    originLocationId: libre.originZoneId,
    destLocationId: libre.destZoneId,
    km: Number(libre.km) || 0,
    clientCount: Number(libre.clientCount) || 0,
    weightKg: Number(libre.weightKg) || 0,
    truckTypeId: libre.truckTypeId,
    serviceType: dia.serviceType,
    fleetType,
    carrierId: libreCarrier?.carrierId ?? null,
    driverId: null,
    customerId: libre.customerId || null,
    durationHours: Number(libre.durationHours) || 0,
    truckVolumeM3: Number(libre.truckVolumeM3) || 0,
    truckWeightTons: Number(libre.truckWeightTons) || 0,
    customVars,
  };
}

/** Calcula un viaje armado a mano con el catálogo del país; los avisos del armado se suman a los del motor. */
export function calculateFreeTrip(catalog: TarifasCatalog, armado: TripContext): Calculo {
  const { input, issues, warnings } = buildCalculateInput(catalog, armado);
  const calc = calculate(input);
  calc.warnings = [...warnings, ...calc.warnings];
  calc.blockingIssues = [...issues, ...calc.blockingIssues];
  return { result: calc, trip: input.trip, rules: catalog.rules };
}
