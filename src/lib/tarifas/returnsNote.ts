// Devoluciones informadas en un viaje.
//
// Definición del negocio: una devolución es mercancía que volvió en medio del viaje. **No cambia lo
// que se le paga al transportista** —el viaje lo hizo igual—, así que no entra al cálculo: se
// registra para que quede constancia y para poder cruzarla después con la factura.
//
// Puede ser PARCIAL (un producto de la factura) o TOTAL (todos).
//
// Módulo PURO. Existe para que no haya dos formatos inventados en dos lugares distintos: uno al
// escribir la nota y otro al leerla.

import type { SettlementReturn } from './types';

const ENCABEZADO = 'Devoluciones informadas:';

export const RETURN_KIND_LABELS: Record<SettlementReturn['kind'], string> = {
  PARCIAL: 'Parcial',
  TOTAL: 'Total',
};

export function emptyReturn(): SettlementReturn {
  return { invoiceNumber: '', productCode: '', kind: 'PARCIAL', notes: null };
}

export type ReturnErrors = Partial<Record<'invoiceNumber' | 'productCode', string>>;

export function validateReturn(value: SettlementReturn): ReturnErrors {
  const errors: ReturnErrors = {};
  if (!value.invoiceNumber.trim()) errors.invoiceNumber = 'Falta el nro de factura.';
  // Una devolución TOTAL abarca todos los productos de la factura: pedir un código sería pedir que
  // alguien elija uno arbitrario.
  if (value.kind === 'PARCIAL' && !value.productCode.trim()) {
    errors.productCode = 'Falta el código de producto.';
  }
  return errors;
}

/** Una línea legible por devolución. */
export function describeReturn(value: SettlementReturn): string {
  const tipo = RETURN_KIND_LABELS[value.kind];
  const producto = value.kind === 'TOTAL'
    ? 'toda la factura'
    : `producto ${value.productCode.trim()}`;
  const nota = value.notes?.trim() ? ` — ${value.notes.trim()}` : '';
  return `factura ${value.invoiceNumber.trim()}, ${producto} (${tipo})${nota}`;
}

/**
 * Serializa las devoluciones al texto de la nota de la liquidación.
 *
 * Se guardan además estructuradas en la liquidación; esto es para que queden a la vista de quien
 * lee la nota sin abrir el detalle.
 */
export function toNote(returns: SettlementReturn[]): string {
  if (returns.length === 0) return '';
  return [ENCABEZADO, ...returns.map((r) => `- ${describeReturn(r)}`)].join('\n');
}

/**
 * Agrega el bloque de devoluciones a una nota existente, reemplazando el anterior si lo había.
 *
 * Sin el reemplazo, editar las devoluciones dejaría dos bloques contradictorios en la misma nota.
 */
export function mergeIntoNotes(notes: string | null, returns: SettlementReturn[]): string | null {
  const previo = (notes ?? '');
  const i = previo.indexOf(ENCABEZADO);
  const base = (i >= 0 ? previo.slice(0, i) : previo).trimEnd();

  const bloque = toNote(returns);
  if (!bloque) return base || null;
  return base ? `${base}\n\n${bloque}` : bloque;
}
