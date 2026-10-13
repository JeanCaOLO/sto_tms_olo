import { todayLocalIso } from '../../../../lib/tarifas/localDate';
import type { CalcResult, FleetType, Rule, ServiceType, TripContext } from '../../../../lib/tarifas/types';

export type Modo = 'viaje' | 'libre';

/** El viaje del modo libre: lo que en el modo viaje aporta guía de despacho, acá se teclea. */
export interface ViajeLibre {
  originZoneId: string;
  destZoneId: string;
  km: string;
  clientCount: string;
  weightKg: string;
  durationHours: string;
  truckTypeId: string;
  truckVolumeM3: string;
  truckWeightTons: string;
  fleetType: FleetType;
  customerId: string;
  carrierId: string;
}

export const viajeLibreInicial = (): ViajeLibre => ({
  originZoneId: '', destZoneId: '',
  km: '100', clientCount: '5', weightKg: '500', durationHours: '4',
  truckTypeId: '', truckVolumeM3: '0', truckWeightTons: '0',
  fleetType: 'OWN', customerId: '', carrierId: '',
});

/** Lo del día del viaje libre: no sale de la compañía, es de esta prueba. */
export interface DatosDelDia {
  quotedAt: string;
  serviceType: ServiceType;
}

// Fecha LOCAL (no UTC): de noche, la UTC ya es "mañana" y una regla que vence hoy aparecería vencida.
export const diaInicial = (): DatosDelDia => ({ quotedAt: todayLocalIso(), serviceType: 'STANDARD' });

/** Lo que se muestra de un cálculo, sea de viaje o libre. */
export interface Calculo {
  result: CalcResult;
  trip: TripContext;
  rules: Rule[];
}

export const mensajeDe = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
