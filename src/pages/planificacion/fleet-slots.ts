import type { FlotaSlot } from './fleet-split';
import type { Conductor, Vehiculo } from './types';

// Arma la flota disponible (vehículo + conductor) que consume el motor de
// planificación. Empareja cada vehículo con un conductor de su mismo
// transportista; si no hay match (catálogo mock/EFLOW incompleto), usa el
// primer conductor disponible para no dejar el vehículo fuera del reparto.
// ponytail: emparejamiento 1:1 simple por transportista, no un asignador
// óptimo de conductores — suficiente para proponer el viaje. Upgrade: respetar
// disponibilidad/turno del conductor cuando ese dato exista.
export function construirSlots(vehiculos: Vehiculo[], conductores: Conductor[]): FlotaSlot[] {
  return vehiculos.map((vehiculo) => {
    const conductor =
      conductores.find((c) => c.carrier_id && c.carrier_id === (vehiculo as { carrier_id?: string }).carrier_id) ??
      conductores[0];
    return { vehiculo, conductorId: conductor?.id ?? '' };
  });
}
