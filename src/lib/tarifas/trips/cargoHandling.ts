// Mercancía en viajes.

import { cargoFromOrders } from '../tripOrders';
import { listTripOrders } from './orderHandling';
import type { CargoSummary } from '../types';

/**
 * La mercancía de un viaje, por casa comercial: los pedidos de sus guías de despacho, sin los
 * anulados. Null si el viaje no tiene pedidos cargados (no hay con qué medir ganancia ni repartir).
 */
export async function getTripCargo(tripId: string): Promise<CargoSummary | null> {
  return cargoFromOrders(await listTripOrders(tripId));
}
