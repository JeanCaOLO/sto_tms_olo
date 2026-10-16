// Liquidaciones de viajes: barril que re-exporta desde el módulo settlements/.
//
// Una liquidación se emite SOBRE UN VIAJE de guía de despacho, completado y sin otra liquidación
// vigente (ROADMAP §8). No hay alta manual: el viaje no se crea acá.
//
// Se guarda entera, desnormalizada y sin referencia a las reglas — a propósito. Una liquidación
// emitida tiene que poder releerse tal cual se emitió aunque después la regla se edite, se
// desactive o se borre, y aunque guía de despacho corrija el viaje: por eso se congela `trip_info`.
//
// Historial: un viaje tiene UNA liquidación vigente. Re-liquidar anula la vigente (queda con su
// snapshot y apuntando a su reemplazo) y emite otra, todo en una transacción.

export type { SettlementFilter, SettlementCursor, SettlementPage } from './settlements/queryHelpers';
export {
  listSettlements,
  listSettlementSummaries,
  listSettlementSummariesPage,
  SETTLEMENT_PAGE_SIZE,
  getSettlement,
  listTripSettlements,
} from './settlements/queryHelpers';
export { dateOnly } from './settlements/mapToDomain';

export type { SettlementInput, SettlementErrors, EmitSettlementResult } from './types';
export { validateSettlement } from './settlements/validation';

export { emitSettlement } from './settlements/emitSettlement';

export { reliquidateSettlement } from './settlements/reliquidateSettlement';

export { updateSettlementStatus } from './settlements/updateSettlementStatus';

export { nextSettlementNumber } from './settlements/numberingAndIds';
