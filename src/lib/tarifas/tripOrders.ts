// Los pedidos de un viaje: de la fila de la vista al dominio, y de los pedidos a la mercancía que se
// mide y se reparte. Módulo PURO (no lee nada).
//
// Un viaje tiene varias guías de despacho y cada guía lleva un pedido. Quien liquida puede anular un
// pedido (no entra en el reparto, ni en la mercancía que se audita) o dejarlo para liquidar después
// (sigue repartiéndose su parte, pero su proforma queda pendiente). Ninguna de las dos marcas cambia
// lo que se le paga al transportista: eso es la acumulación de gastos del viaje.

import Decimal from 'decimal.js';
import type { Row } from './data';
import type {
  CargoPart, CargoSummary, OrderMark, SettlementOrder, TripOrder, TripRecord,
} from './types';

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const text = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

export function toTripOrder(row: Row): TripOrder {
  const mark = text(row.mark);
  return {
    guideId: String(row.id),
    guideNumber: text(row.guide_number),
    sequence: row.sequence_number === null || row.sequence_number === undefined ? null : num(row.sequence_number),
    deliveryStatus: text(row.delivery_status),
    orderId: text(row.order_id),
    orderNumber: text(row.order_number),
    customerId: text(row.customer_id),
    customerCode: text(row.customer_code),
    customerName: text(row.customer_name),
    value: String(row.value ?? '0'),
    weightKg: num(row.weight_kg),
    volumeM3: num(row.volume_m3),
    items: num(row.items),
    mark: mark === 'ANULADO' || mark === 'DIFERIDO' ? mark : null,
    markReason: text(row.mark_reason),
  };
}

export const isDelivered = (order: Pick<TripOrder, 'deliveryStatus'>): boolean =>
  (order.deliveryStatus ?? '').toLowerCase() === 'delivered';

const DELIVERY_LABELS: Record<string, string> = {
  delivered: 'Entregado', pending: 'Pendiente', in_transit: 'En tránsito', failed: 'Fallido',
};
export const deliveryLabel = (status: string | null): string =>
  DELIVERY_LABELS[(status ?? '').toLowerCase()] ?? (status || 'Sin estado');

/** ¿Qué tan completo está el viaje? Para auditar cuáles faltan. */
export interface TripProgress {
  delivered: number;
  total: number;
  /** Completado en guía de despacho Y con todas sus guías entregadas. */
  complete: boolean;
  /** Frase corta para la tabla: "3 de 4 entregados", "no completado"… */
  label: string;
}

export function tripProgress(trip: Pick<TripRecord, 'status' | 'guideCount' | 'deliveredGuides' | 'totalStops' | 'completedStops'>): TripProgress {
  const total = Math.max(trip.guideCount, 0);
  const delivered = Math.min(Math.max(trip.deliveredGuides, 0), total || trip.deliveredGuides);
  const stopsDone = trip.totalStops <= 0 || trip.completedStops >= trip.totalStops;
  const allDelivered = total === 0 || delivered >= total;
  const complete = trip.status === 'completed' && allDelivered && stopsDone;
  let label: string;
  if (trip.status !== 'completed') label = 'Viaje no completado';
  else if (!allDelivered) label = `${delivered} de ${total} pedidos entregados`;
  else if (!stopsDone) label = `${trip.completedStops} de ${trip.totalStops} paradas`;
  else label = 'Completo';
  return { delivered, total, complete, label };
}

/**
 * La mercancía de un viaje por casa comercial, a partir de sus pedidos. Los anulados no cuentan;
 * los diferidos sí (siguen repartiéndose) y se anotan para saber que su proforma está pendiente.
 * Un pedido cuenta una vez aunque aparezca en más de una guía. Null si no queda ninguno.
 */
export function cargoFromOrders(orders: TripOrder[]): CargoSummary | null {
  const seen = new Set<string>();
  const byCustomer = new Map<string, CargoPart>();

  for (const order of orders) {
    if (order.mark === 'ANULADO') continue;
    const orderKey = order.orderId ?? `guia:${order.guideId}`;
    if (seen.has(orderKey)) continue;
    seen.add(orderKey);

    const key = order.customerId ?? 'sin-casa';
    const part = byCustomer.get(key) ?? {
      customerId: order.customerId,
      code: order.customerCode,
      name: order.customerName ?? 'Sin casa comercial',
      value: '0', weightKg: 0, volumeM3: 0, items: 0, orders: 0, deferredOrders: 0,
    };
    part.value = new Decimal(part.value).plus(order.value).toFixed(2);
    part.weightKg += order.weightKg;
    part.volumeM3 += order.volumeM3;
    part.items += order.items;
    part.orders += 1;
    if (order.mark === 'DIFERIDO') part.deferredOrders = (part.deferredOrders ?? 0) + 1;
    byCustomer.set(key, part);
  }

  const parts = [...byCustomer.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (parts.length === 0) return null;
  return {
    value: parts.reduce((sum, p) => sum.plus(p.value), new Decimal(0)).toFixed(2),
    weightKg: parts.reduce((sum, p) => sum + p.weightKg, 0),
    volumeM3: parts.reduce((sum, p) => sum + p.volumeM3, 0),
    orders: parts.reduce((sum, p) => sum + p.orders, 0),
    parts,
  };
}

/** Foto de los pedidos para guardar en la liquidación. */
export function snapshotOrders(orders: TripOrder[]): SettlementOrder[] {
  return orders.map((o) => ({
    orderId: o.orderId,
    orderNumber: o.orderNumber,
    guideNumber: o.guideNumber,
    customerName: o.customerName,
    value: o.value,
    deliveryStatus: o.deliveryStatus,
    status: o.mark === 'ANULADO' ? 'ANULADO' : o.mark === 'DIFERIDO' ? 'DIFERIDO' : 'INCLUIDO',
    reason: o.markReason,
  }));
}

export const MARK_LABELS: Record<OrderMark | 'INCLUIDO', string> = {
  INCLUIDO: 'Incluido', ANULADO: 'Anulado', DIFERIDO: 'Liquidar después',
};
