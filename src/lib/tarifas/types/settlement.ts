// Viajes, ediciones y liquidaciones: registros persistidos.

import type { Money } from './variables';
import type { SettlementBaseChange } from './trace';
import type { VarValue } from './variables';
import type { TripContext } from './trip';
import type { Stage } from './ast';
import type { SettlementOrder } from './cargo';
import type { Allocation } from './cargo';
import type { TraceLine } from './trace';
import type { DiscardedRule } from './trace';
import type { Rule } from './ast';
import type { Override } from './rateTable';
import type { MarginStatus } from './cost';

// ── Viajes del TMS (solo lectura) ─────────────────────────────────────────────────────────────
// El liquidador NO crea viajes: consume los de guía de despacho (`routes`), ya armados por la vista
// `tarifas_v_viajes` con su transportista, conductor, vehículo y zona. Ver ROADMAP §8.

/** Estado del viaje, normalizado por la vista. Solo 'completed' se liquida. */
export type TripStatus = 'completed' | 'planned' | 'in_progress' | string;

/** Un viaje de guía de despacho, tal como lo lee el liquidador. */
export interface TripRecord {
  id: string;
  countryId: string;
  /** Número del viaje (`routes.route_number`). Es el dato con el que la gente busca. */
  routeNumber: string;
  /** 'YYYY-MM-DD'. Resuelve la vigencia de las reglas. */
  routeDate: string;
  status: TripStatus;
  carrierId: string | null;
  carrierName: string | null;
  /** `carriers.is_flota_propia`. Nulo = el viaje no tiene transportista asignado. */
  isOwnFleet: boolean | null;
  driverId: string | null;
  driverName: string | null;
  driverDocument: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  /** `vehicles.vehicle_type`: el "tipo de camión" con el que se buscan las tarifas. */
  vehicleType: string | null;
  capacityWeightKg: number;
  capacityVolumeM3: number;
  destZoneId: string | null;
  destZoneCode: string | null;
  destZoneName: string | null;
  km: number;
  totalStops: number;
  completedStops: number;
  weightKg: number;
  volumeM3: number;
  actualStartTime: string | null;
  actualEndTime: string | null;
  durationHours: number;
  guideCount: number;
  /** Guías (una por pedido) ya entregadas. */
  deliveredGuides: number;
  returnCount: number;
  /** Liquidación vigente del viaje, o nulo si todavía no se liquidó. */
  settlementId: string | null;
  /** El viaje ya tuvo una liquidación y se anuló: vuelve a la bandeja para liquidarse de nuevo. */
  hadAnnulledSettlement?: boolean;
}

/**
 * Lo variable que se carga a mano al liquidar un viaje (además de las devoluciones, que se guardan
 * aparte en `SettlementRecord.returns`). Los datos del viaje (km, paradas, vehículo…) son de guía
 * de despacho y no se editan desde el liquidador.
 */
export interface TripEdits {
  /** Valores de las variables personalizadas PER_TRIP (peajes, recolectas, horas de espera…). */
  customVars: Record<string, VarValue>;
}


export type SettlementStatus = 'Borrador' | 'En Revisión' | 'Aprobado' | 'Pagado' | 'Anulado';

/** Una devolución informada en el viaje. Es informativa: no cambia lo que se le paga al transportista. */
export interface SettlementReturn {
  invoiceNumber: string;
  productCode: string;
  /** 'PARCIAL' = un producto de la factura; 'TOTAL' = todos. */
  kind: 'PARCIAL' | 'TOTAL';
  notes?: string | null;
}

/**
 * La liquidación emitida de un viaje, con su desglose completo.
 *
 * El desglose se guarda desnormalizado y sin referencia a las reglas, a propósito: una liquidación
 * emitida tiene que poder releerse tal cual se emitió aunque después la regla se edite, se
 * desactive o se borre. Por la misma razón `tripInfo` congela lo que se leyó del viaje: si guía de
 * despacho lo corrige después, la liquidación vieja sigue diciendo con qué datos se calculó.
 */
export interface SettlementRecord {
  id: string;
  countryId: string;
  /** El viaje liquidado (`routes.id`). */
  tripId: string;
  /** Perfil de cálculo con el que se liquidó. Nulo = transportista sin perfil. */
  partyId: string | null;
  /** Número propio del módulo: 'LIQ-VE-001' (antes 'LIQ-0001'). */
  number: string;
  /** Número del viaje (`route_number`), congelado. */
  tripNumber: string;
  /** 'YYYY-MM-DD'. Fecha del viaje: es la que resolvió la vigencia de las reglas. */
  settlementDate: string;
  status: SettlementStatus;
  /** Foto del viaje al emitir. */
  tripInfo: TripRecord;
  /** Lo cargado a mano al liquidar. */
  tripEdits: TripEdits;
  /** Liquidación que reemplazó a esta al re-liquidar. Nulo = sigue vigente (o anulada sin reemplazo). */
  supersededBy: string | null;
  currency: string;
  totalAmount: Money;
  notes: string | null;
  marginReason: string | null;
  marginStatus: MarginStatus | null;
  marginAmount: Money | null;
  marginPct: string | null;
  costTotal: Money | null;
  costModelId: string | null;
  /** Valor de la mercancía del viaje al emitir. Nulo = no se conocía. */
  cargoValue: Money | null;
  /** Reparto del total entre casas comerciales al emitir. Nulo = el viaje no tenía pedidos. */
  allocation: Allocation | null;
  /** Pedidos del viaje al emitir y qué se hizo con cada uno. Nulo = no había pedidos cargados. */
  orders: SettlementOrder[] | null;
  trip: TripContext;
  trace: TraceLine[];
  discarded: DiscardedRule[];
  stageSubtotals: Record<Stage, Money>;
  warnings: string[];
  overrides: Record<string, Override>;
  adhocRules: Rule[];
  /** Reglas del catálogo que produjeron líneas, tal como estaban al emitir (para poder explicarlas después). */
  rulesUsed: Rule[];
  /** Líneas que el liquidador destildó: se excluyeron del total. */
  excludedSeqs: number[];
  /** Base de cálculo cambiada por el liquidador. Nulo = se usó la base por defecto. */
  baseChange?: SettlementBaseChange | null;
  returns: SettlementReturn[];
  createdAt: string;
  updatedAt: string;
}
