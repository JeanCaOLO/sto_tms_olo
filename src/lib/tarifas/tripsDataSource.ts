// Viajes a liquidar: los de guía de despacho, leídos por la capa de datos.
//
// El liquidador NO crea ni edita viajes — son de guía de despacho. Acá solo se consultan (entidad
// externa `trip`, vista `tarifas_v_viajes`), igual que cualquier otro dato: por `db()`, nunca por un
// fetch aparte.

import { db, type Condition } from './data';
import { isLiquidable, toTripRecord } from './tripContext';
import { getActorRole } from './actor';
import { cargoFromOrders, toTripOrder, tripProgress } from './tripOrders';
import type { CargoSummary, OrderMark, SettlementReturn, TripOrder, TripRecord } from './types';

export interface TripFilter {
  countryId?: string;
  carrierId?: string;
  /** 'YYYY-MM-DD', inclusive. */
  from?: string;
  to?: string;
  /** Estado normalizado ('completed', 'planned'…). */
  status?: string;
}

function whereOf(filter: TripFilter): Condition[] {
  const where: Condition[] = [];
  if (filter.countryId) where.push({ column: 'country_id', op: 'eq', value: filter.countryId });
  if (filter.carrierId) where.push({ column: 'carrier_id', op: 'eq', value: filter.carrierId });
  if (filter.status) where.push({ column: 'status', op: 'eq', value: filter.status });
  if (filter.from) where.push({ column: 'route_date', op: 'gte', value: filter.from });
  if (filter.to) where.push({ column: 'route_date', op: 'lte', value: filter.to });
  return where;
}

/**
 * Completa `settlementId` con la liquidación VIGENTE de cada viaje, leída de las liquidaciones.
 *
 * En Aurora la vista ya lo trae; se vuelve a resolver acá para que el criterio "¿está liquidado?"
 * sea uno solo con cualquier driver (el JSON no tiene vistas) y para no depender de que la vista y
 * la tabla estén leídas en el mismo instante.
 */
async function withVigentes(trips: TripRecord[]): Promise<TripRecord[]> {
  if (trips.length === 0) return trips;
  const vigentes = await db().find('settlement', {
    where: [
      { column: 'trip_id', op: 'in', value: trips.map((t) => t.id) },
      { column: 'status', op: 'neq', value: 'Anulado' },
    ],
    // Solo se necesitan los dos ids: sin esto traía cada liquidación entera con sus JSONB.
    columns: ['id', 'trip_id'],
  });
  const porViaje = new Map(vigentes.map((s) => [String(s.trip_id), String(s.id)]));
  return trips.map((t) => ({ ...t, settlementId: porViaje.get(t.id) ?? null }));
}

const ORDEN = [
  { column: 'route_date', direction: 'desc' as const },
  { column: 'route_number', locale: true },
];

export async function listTrips(filter: TripFilter = {}): Promise<TripRecord[]> {
  const rows = await db().find('trip', { where: whereOf(filter), orderBy: ORDEN });
  return withVigentes(rows.map(toTripRecord));
}

/**
 * Condición que descarta en el servidor los viajes que ya tienen liquidación vigente. En Aurora la
 * vista trae `settlement_id` al día; con el driver JSON esa columna no se llena y el filtro no descarta
 * nada. Por eso es solo un PREFILTRO: lo que decide si un viaje está liquidado sigue siendo `withVigentes`.
 * Sin esto, cada carga de la bandeja traía todo el historial de viajes (hasta el tope de 5000).
 */
const SIN_LIQUIDACION: Condition = { column: 'settlement_id', op: 'isNull' };

/** Viajes COMPLETADOS sin liquidación vigente: la bandeja "Viajes por liquidar". */
export async function listLiquidableTrips(filter: Omit<TripFilter, 'status'> = {}): Promise<TripRecord[]> {
  const rows = await db().find('trip', {
    where: [...whereOf(filter), { column: 'status', op: 'eq', value: 'completed' }, SIN_LIQUIDACION],
    orderBy: ORDEN,
  });
  // `isLiquidable` es la misma regla que valida al emitir.
  return (await withVigentes(rows.map(toTripRecord))).filter(isLiquidable);
}

/** Qué viajes mostrar en la bandeja. */
export type TripScope =
  /** Completados y 100 % entregados, sin liquidación vigente: los que se pueden liquidar sin dudas. */
  | 'ready'
  /** Sin liquidación vigente y con algo pendiente (no completados o con pedidos sin entregar): para auditar. */
  | 'incomplete'
  /** Todos los que no tienen liquidación vigente (menos los anulados). */
  | 'all';

/**
 * Viajes sin liquidación vigente según `scope`. Los viajes anulados en guía de despacho nunca se
 * listan: no hay nada que auditar de ellos.
 */
export async function listPendingTrips(
  scope: TripScope,
  filter: Omit<TripFilter, 'status'> = {},
): Promise<TripRecord[]> {
  if (scope === 'ready') {
    return (await listLiquidableTrips(filter)).filter((t) => tripProgress(t).complete);
  }
  const rows = await db().find('trip', {
    where: [...whereOf(filter), SIN_LIQUIDACION, { column: 'status', op: 'neq', value: 'cancelled' }],
    orderBy: ORDEN,
  });
  const trips = (await withVigentes(rows.map(toTripRecord))).filter((t) => !t.settlementId && t.status !== 'cancelled');
  return scope === 'incomplete' ? trips.filter((t) => !tripProgress(t).complete) : trips;
}

export async function getTrip(id: string): Promise<TripRecord | null> {
  const row = await db().findOne('trip', id);
  if (!row) return null;
  const [trip] = await withVigentes([toTripRecord(row)]);
  return trip;
}

/** Paradas del viaje (guías), en orden de visita. Solo para mostrar el detalle. */
export async function listTripGuides(tripId: string) {
  return db().find('dispatchGuide', {
    where: [{ column: 'route_id', op: 'eq', value: tripId }],
    orderBy: [{ column: 'sequence_number' }],
  });
}

/**
 * Devoluciones registradas en guía de despacho para este viaje, en la forma que se informa en la
 * liquidación. Sirven para PRECARGAR: quien liquida las revisa y puede ajustarlas.
 */
export async function listTripReturns(tripId: string): Promise<SettlementReturn[]> {
  const rows = await db().find('tripReturn', {
    where: [{ column: 'route_id', op: 'eq', value: tripId }],
    orderBy: [{ column: 'return_number', locale: true }],
  });
  return rows.map((r) => ({
    // `returns` no guarda la factura: el número de devolución es la referencia que hay.
    invoiceNumber: String(r.return_number ?? ''),
    productCode: String(r.product_code ?? ''),
    kind: r.product_code ? 'PARCIAL' : 'TOTAL',
    notes: [r.reason, r.product_name, r.quantity ? `cant. ${r.quantity}` : null].filter(Boolean).join(' · ') || null,
  }));
}

/** Los pedidos de un viaje (uno por guía), con la marca que se les haya puesto. */
export async function listTripOrders(tripId: string): Promise<TripOrder[]> {
  const rows = await db().find('tripOrder', {
    where: [{ column: 'route_id', op: 'eq', value: tripId }],
    orderBy: [{ column: 'sequence_number' }, { column: 'guide_number', locale: true }],
  });
  // La marca se lee de su tabla (no solo de la vista) para que valga igual con cualquier driver.
  const marks = await db().find('tripOrderMark', {
    where: [{ column: 'trip_id', op: 'eq', value: tripId }],
  });
  const byOrder = new Map(marks.map((m) => [String(m.order_id), m]));
  return rows.map((row) => {
    const mark = row.order_id ? byOrder.get(String(row.order_id)) : undefined;
    return toTripOrder(mark ? { ...row, mark: mark.mark, mark_reason: mark.reason } : row);
  });
}

/**
 * La mercancía de un viaje, por casa comercial: los pedidos de sus guías de despacho, sin los
 * anulados. Null si el viaje no tiene pedidos cargados (no hay con qué medir ganancia ni repartir).
 */
export async function getTripCargo(tripId: string): Promise<CargoSummary | null> {
  return cargoFromOrders(await listTripOrders(tripId));
}

export interface OrderMarkInput {
  trip: Pick<TripRecord, 'id' | 'countryId'>;
  orderId: string;
  /** Null = quitar la marca: el pedido vuelve a entrar en la liquidación. */
  mark: OrderMark | null;
  reason?: string | null;
}

/**
 * Anula un pedido del viaje, lo deja para liquidar después, o le quita la marca. Una sola marca por
 * pedido y viaje. Anular exige un motivo: es lo que la auditoría va a querer saber.
 */
export async function setOrderMark(input: OrderMarkInput): Promise<{ error: string | null }> {
  const reason = input.reason?.trim() || null;
  if (input.mark === 'ANULADO' && !reason) return { error: 'Indicá por qué se anula el pedido.' };

  try {
    await db().transaction(async (tx) => {
      const existing = await tx.find('tripOrderMark', {
        where: [
          { column: 'trip_id', op: 'eq', value: input.trip.id },
          { column: 'order_id', op: 'eq', value: input.orderId },
        ],
      });
      if (!input.mark) {
        for (const row of existing) await tx.delete('tripOrderMark', row.id);
        return;
      }
      const values = {
        country_id: input.trip.countryId,
        trip_id: input.trip.id,
        order_id: input.orderId,
        mark: input.mark,
        reason,
        actor: getActorRole(),
      };
      if (existing[0]) await tx.update('tripOrderMark', existing[0].id, values);
      else await tx.insert('tripOrderMark', values);
    });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
