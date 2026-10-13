// Resumen de liquidación para bitácora.

import type { Row } from '../data';

export function resumen(row: Row): Row {
  return {
    numero: row.number,
    viaje: row.trip_number,
    estado: row.status,
    total: row.total_amount,
    moneda: row.currency,
    margen: row.margin_status,
    ...(row.base_change ? { base: (row.base_change as { method?: string }).method } : {}),
  } as Row;
}
