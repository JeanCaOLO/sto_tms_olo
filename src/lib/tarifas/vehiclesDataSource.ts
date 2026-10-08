// Tipos de camión, leídos del catálogo de vehículos del TMS (entidad externa `vehicle`).
//
// Reemplaza al catálogo de vehículos POR COMPAÑÍA que tenía el tarifador (2026-10-02, ROADMAP §8):
// el "tipo de camión" con el que se buscan tarifas es `vehicles.vehicle_type` del vehículo del
// viaje, y su capacidad la del vehículo. Acá se ofrece la lista de tipos para armar tarifarios y
// tarifas de outsourcing (columna `truckTypeId`).

import { db, type Condition } from './data';

export interface TruckTypeOption {
  /** El texto de `vehicles.vehicle_type` tal cual: es la clave que comparan las tarifas. */
  code: string;
  /** Cuántos vehículos activos lo usan. */
  vehicleCount: number;
  /** Capacidad máxima entre esos vehículos (orientativa: la del viaje es la de SU vehículo). */
  maxWeightTons: number;
  maxVolumeM3: number;
}

/** Tipos de camión distintos del catálogo, opcionalmente solo los de un transportista. */
export async function listTruckTypes(options?: { carrierId?: string }): Promise<TruckTypeOption[]> {
  const where: Condition[] = [];
  if (options?.carrierId) where.push({ column: 'carrier_id', op: 'eq', value: options.carrierId });

  const vehicles = await db().find('vehicle', { where });
  const porTipo = new Map<string, TruckTypeOption>();

  for (const v of vehicles) {
    if (v.status === 'inactive' || !v.vehicle_type) continue;
    const code = String(v.vehicle_type);
    const actual = porTipo.get(code) ?? { code, vehicleCount: 0, maxWeightTons: 0, maxVolumeM3: 0 };
    actual.vehicleCount += 1;
    actual.maxWeightTons = Math.max(actual.maxWeightTons, (Number(v.capacity_weight) || 0) / 1000);
    actual.maxVolumeM3 = Math.max(actual.maxVolumeM3, Number(v.capacity_volume) || 0);
    porTipo.set(code, actual);
  }

  return [...porTipo.values()].sort((a, b) => a.code.localeCompare(b.code));
}
