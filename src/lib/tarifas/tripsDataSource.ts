// Viajes a liquidar: barril que re-exporta desde el módulo trips/.
//
// El liquidador NO crea ni edita viajes — son de guía de despacho. Acá solo se consultan (entidad
// externa `trip`, vista `tarifas_v_viajes`), igual que cualquier otro dato: por `db()`, nunca por un
// fetch aparte.

export type { TripFilter, TripListOptions } from './trips/queryHelpers';
export {
  TRIPS_LIMIT,
  listTrips,
  listLiquidableTrips,
  getTrip,
  listTripGuides,
} from './trips/queryHelpers';

export {
  listTripReturns,
} from './trips/returnHandling';

export {
  listTripOrders,
} from './trips/orderHandling';

export {
  getTripCargo,
} from './trips/cargoHandling';

export type { TripScope } from './trips/pendingTrips';
export {
  listPendingTrips,
} from './trips/pendingTrips';

export type { OrderMarkInput } from './trips/orderMarkHandling';
export {
  setOrderMark,
} from './trips/orderMarkHandling';
