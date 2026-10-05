// Viajes a liquidar: los de guía de despacho, leídos por la capa de datos.
//
// El liquidador NO crea ni edita viajes — son de guía de despacho. Acá solo se consultan (entidad
// externa `trip`, vista `tarifas_v_viajes`), igual que cualquier otro dato: por `db()`, nunca por un
// fetch aparte.

import Decimal from 'decimal.js';
import { db, type Condition } from './data';
import { isLiquidable, toTripRecord } from './tripContext';
import type { CargoPart, CargoSummary, SettlementReturn, TripRecord } from './types';

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

/** Viajes COMPLETADOS sin liquidación vigente: la bandeja "Viajes por liquidar". */
export async function listLiquidableTrips(filter: Omit<TripFilter, 'status'> = {}): Promise<TripRecord[]> {
  const rows = await db().find('trip', {
    where: [...whereOf(filter), { column: 'status', op: 'eq', value: 'completed' }],
    orderBy: ORDEN,
  });
  // `isLiquidable` es la misma regla que valida al emitir.
  return (await withVigentes(rows.map(toTripRecord))).filter(isLiquidable);
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

/**
 * La mercancía de un viaje, por casa comercial: los pedidos de sus guías de despacho. Null si el
 * viaje no tiene pedidos cargados (no hay con qué medir ganancia ni repartir). Solo lectura.
 */
export async function getTripCargo(tripId: string): Promise<CargoSummary | null> {
  const rows = await db().find('tripCargo', {
    where: [{ column: 'route_id', op: 'eq', value: tripId }],
    orderBy: [{ column: 'customer_name', locale: true }],
  });
  if (rows.length === 0) return null;

  const parts: CargoPart[] = rows.map((r) => ({
    customerId: r.customer_id ?? null,
    code: r.customer_code ?? null,
    name: String(r.customer_name ?? 'Sin casa comercial'),
    value: String(r.value ?? '0'),
    weightKg: Number(r.weight_kg ?? 0),
    volumeM3: Number(r.volume_m3 ?? 0),
    items: Number(r.items ?? 0),
    orders: Number(r.orders ?? 0),
  }));
  return {
    value: parts.reduce((sum, p) => sum.plus(p.value), new Decimal(0)).toFixed(2),
    weightKg: parts.reduce((sum, p) => sum + p.weightKg, 0),
    volumeM3: parts.reduce((sum, p) => sum + p.volumeM3, 0),
    orders: parts.reduce((sum, p) => sum + p.orders, 0),
    parts,
  };
}
