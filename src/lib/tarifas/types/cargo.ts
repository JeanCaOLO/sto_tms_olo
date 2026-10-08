// Mercancía del viaje: carga, pedidos y reparto entre casas comerciales.

import type { Money } from './variables';

// ── Mercancía del viaje y reparto entre casas comerciales ─────────────────────────────────────

/** Lo que una casa comercial (cliente) pone en un viaje: sus pedidos, vistos por las guías de despacho. */
export interface CargoPart {
  customerId: string | null;
  code: string | null;
  name: string;
  /** Valor de la mercancía (`orders.total_amount`). */
  value: Money;
  weightKg: number;
  volumeM3: number;
  items: number;
  orders: number;
  /** De esos pedidos, cuántos se dejaron para liquidar después. */
  deferredOrders?: number;
}

/** Lo que se decide con un pedido de un viaje: anularlo (no entra en el reparto) o dejarlo para después. */
export type OrderMark = 'ANULADO' | 'DIFERIDO';

/** Un pedido de un viaje, visto por su guía de despacho (una guía lleva un pedido). */
export interface TripOrder {
  guideId: string;
  guideNumber: string | null;
  sequence: number | null;
  /** 'pending' | 'in_transit' | 'delivered' | 'failed' (vocabulario de guía de despacho). */
  deliveryStatus: string | null;
  orderId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  value: Money;
  weightKg: number;
  volumeM3: number;
  items: number;
  mark: OrderMark | null;
  markReason: string | null;
}

/** Qué se hizo con un pedido al emitir la liquidación (foto congelada). */
export interface SettlementOrder {
  orderId: string | null;
  orderNumber: string | null;
  guideNumber: string | null;
  customerName: string | null;
  value: Money;
  deliveryStatus: string | null;
  /** INCLUIDO = entra en el reparto; ANULADO = fuera, con su motivo; DIFERIDO = entra, pero su proforma queda pendiente. */
  status: 'INCLUIDO' | 'ANULADO' | 'DIFERIDO';
  reason: string | null;
}

/** Todo lo que lleva un viaje, por casa comercial. */
export interface CargoSummary {
  value: Money;
  weightKg: number;
  volumeM3: number;
  orders: number;
  parts: CargoPart[];
}

/** Con qué se reparte el costo del viaje entre las casas comerciales. */
export type AllocationCriterion = 'VALUE' | 'WEIGHT' | 'VOLUME';

export interface AllocationShare {
  customerId: string | null;
  code: string | null;
  name: string;
  /** Parte del reparto (0 a 1) con 6 decimales. */
  share: string;
  /** Lo que le toca pagar a la casa. La suma de todas es exactamente el total repartido. */
  amount: Money;
  value: Money;
  weightKg: number;
  volumeM3: number;
  orders: number;
  /** Pedidos de esta casa que quedaron para liquidar después: su proforma está pendiente. */
  deferredOrders?: number;
}

export interface Allocation {
  criterion: AllocationCriterion;
  /** Cuál se usó de verdad: cae a repartir por pedidos si la base elegida suma cero. */
  basis: AllocationCriterion | 'ORDERS';
  total: Money;
  currency: string;
  shares: AllocationShare[];
}
