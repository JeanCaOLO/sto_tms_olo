// Devoluciones de viajes.

import { db } from '../data';
import type { SettlementReturn } from '../types';

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
