// Utilidades y búsqueda de encabezados para tarifarios.

import { normalizeText } from '../../text';
import { parseAmount, type NumberFormat, type SheetMatrix } from '../cost-sheet-parser';
import type { VarKey } from '../types';

export function text(cell: string | number | null | undefined): string {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

/** Alias para fold de texto normalizado. */
export const fold = normalizeText;

/**
 * Palabras con las que un encabezado puede estar nombrando cada variable de la clave.
 * Deliberadamente generosas para capturar variantes reales.
 */
export const HEADER_HINTS: Partial<Record<VarKey, string[]>> = {
  originZone: ['zona origen', 'origen', 'desde', 'zona de origen', 'origin'],
  destZone: ['zona destino', 'destino', 'hasta', 'zona de destino', 'destination'],
  originZoneGroup: ['grupo origen', 'grupo de origen', 'region origen'],
  destZoneGroup: ['grupo destino', 'grupo de destino', 'region destino'],
  truckTypeId: ['tipo de camion', 'camion', 'vehiculo', 'tipo de vehiculo', 'unidad', 'truck'],
  serviceType: ['tipo de servicio', 'servicio', 'service'],
  fleetType: ['flota', 'tipo de flota', 'fleet'],
  carrierId: ['transportista', 'proveedor', 'carrier'],
  customerId: ['cliente', 'customer'],
  countryId: ['pais', 'country'],
  weekday: ['dia', 'dia de la semana'],
};

export const AMOUNT_HINTS = [
  'importe', 'monto', 'precio', 'tarifa', 'valor', 'costo', 'coste', 'amount', 'rate', 'price',
];

/** Obtiene las pistas de búsqueda para una variable (estándar o personalizada). */
export function hintsOf(column: VarKey, customLabels: Record<string, string> = {}): string[] {
  const known = HEADER_HINTS[column];
  if (known) return known;
  if (!column.startsWith('custom:')) return [];
  return [customLabels[column], column.slice('custom:'.length).replace(/_/g, ' ')]
    .filter((h): h is string => !!h)
    .map(fold);
}

/** Busca por encabezado en una lista de headers normalizados. */
export function findHeaderByHints(
  headers: string[],
  hints: string[],
  usadas: Set<number>,
): number | null {
  for (let i = 0; i < headers.length; i += 1) {
    if (usadas.has(i)) continue;
    const header = fold(headers[i] ?? '');
    if (!header) continue;
    if (hints.some((hint) => header === hint || header.includes(hint))) {
      usadas.add(i);
      return i;
    }
  }
  return null;
}

/** Encuentra la última columna numérica en una matriz de datos. */
export function findLastNumericColumn(
  matrix: SheetMatrix,
  firstDataRow: number,
  excluidas: Set<number>,
): number | null {
  const cuerpo = matrix.slice(firstDataRow).filter((row) => row.some((c) => text(c) !== ''));
  if (cuerpo.length === 0) return null;

  const columnas = Math.max(...cuerpo.map((row) => row.length));
  for (let i = columnas - 1; i >= 0; i -= 1) {
    if (excluidas.has(i)) continue;
    const valores = cuerpo.map((row) => row[i]).filter((c) => text(c) !== '');
    if (valores.length === 0) continue;
    const numericas = valores.filter((c) => parseAmount(c) !== null).length;
    if (numericas / valores.length >= 0.7) return i;
  }
  return null;
}
