// Importación de un tarifario desde planilla.
//
// Se diferencia de `rateImport.ts` en que allá la forma del archivo es FIJA (tipo de camión +
// precio) y acá la decide la tabla: una columna por cada variable de su clave, más el importe. Un
// tarifario de zonas trae dos columnas de clave; uno de zona + camión + servicio trae tres.
//
// Lo que NO hace: adivinar a qué tabla va el archivo ni qué moneda tiene. Eso se elige en el
// importador, porque la planilla casi nunca lo trae y suponerlo sería inventar.
//
// Módulo PURO: recibe una matriz de celdas, no un archivo.

import { detectHeaderRow, parseAmount, type NumberFormat, type SheetMatrix } from './costSheetParser';
import { RATE_TABLE_WILDCARD, type VarKey } from './types';

/** Índice de columna de la planilla para cada parte de la fila. `null` = sin mapear. */
export interface RateTableMapping {
  /** Un índice por cada columna de la clave, en el mismo orden que `keyColumns`. */
  key: (number | null)[];
  amount: number | null;
}

export interface RateTableSheetAnalysis {
  headerRow: number;
  firstDataRow: number;
  headers: string[];
  mapping: RateTableMapping;
  notes: string[];
}

export interface ParsedRateTableRow {
  key: string[];
  /** Decimal en texto, ya limpio de símbolos. */
  amount: string;
  /** Valor original de la celda del importe, para mostrarlo al lado en la vista previa. */
  rawAmount: string;
  sourceRow: number;
}

export interface RateTableProblem {
  sourceRow: number;
  key: string[];
  reason: string;
}

export interface ParsedRateTable {
  rows: ParsedRateTableRow[];
  skipped: RateTableProblem[];
}

function text(cell: string | number | null | undefined): string {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

/** Sin acentos ni mayúsculas, para comparar un encabezado con el nombre de una variable. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Palabras con las que un encabezado puede estar nombrando cada variable de la clave.
 *
 * Deliberadamente generosas: el archivo lo escribe el transportista, no el sistema, y viene con
 * "Origen", "Zona origen" o "Desde" para la misma columna. Un mapeo equivocado se corrige en el
 * importador; uno que no se intenta obliga a mapear todo a mano siempre.
 */
const HEADER_HINTS: Partial<Record<VarKey, string[]>> = {
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

const AMOUNT_HINTS = [
  'importe', 'monto', 'precio', 'tarifa', 'valor', 'costo', 'coste', 'amount', 'rate', 'price',
];

/**
 * Propone un mapeo mirando los encabezados.
 *
 * El importe se busca primero por el nombre del encabezado y, si ninguno lo nombra, se cae a la
 * ÚLTIMA columna cuyo cuerpo sea numérico: en un tarifario el precio casi siempre está al final, y
 * quedarse sin proponer nada obliga a mapear a mano hasta lo obvio.
 */
export function analyzeRateTableSheet(
  matrix: SheetMatrix,
  keyColumns: VarKey[],
): RateTableSheetAnalysis {
  const headerRow = detectHeaderRow(matrix);
  const headers = (matrix[headerRow] ?? []).map(text);
  const firstDataRow = headerRow + 1;
  const notes: string[] = [];

  const usadas = new Set<number>();

  const buscarPorEncabezado = (hints: string[]): number | null => {
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
  };

  const key = keyColumns.map((column) => buscarPorEncabezado(HEADER_HINTS[column] ?? []));

  let amount = buscarPorEncabezado(AMOUNT_HINTS);
  if (amount === null) {
    amount = ultimaColumnaNumerica(matrix, firstDataRow, usadas);
    if (amount !== null) {
      notes.push('Ningún encabezado nombra el importe: se tomó la última columna con números.');
    }
  }

  // Sin encabezados reconocibles, el orden de la planilla suele ser el orden de la clave: se
  // proponen las primeras columnas y el usuario corrige lo que esté mal.
  if (key.every((k) => k === null) && headers.length >= keyColumns.length) {
    for (let i = 0; i < keyColumns.length; i += 1) {
      if (i !== amount) key[i] = i;
    }
    notes.push('No se reconoció ningún encabezado: se propusieron las primeras columnas en orden.');
  }

  const sinMapear = keyColumns.filter((_c, i) => key[i] === null).length;
  if (sinMapear > 0) {
    notes.push(`${sinMapear} columna${sinMapear === 1 ? '' : 's'} de la clave sin asignar: revisá el mapeo.`);
  }

  return { headerRow, firstDataRow, headers, mapping: { key, amount }, notes };
}

function ultimaColumnaNumerica(
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
    // Mayoría, no unanimidad: una fila de totales o una celda sucia no deberían descartar la
    // columna entera.
    if (numericas / valores.length >= 0.7) return i;
  }
  return null;
}

/**
 * Convierte la planilla en filas de tarifario.
 *
 * Una celda de clave vacía queda como comodín (`*`), que es la lectura natural: en un tarifario
 * escrito a mano, la columna en blanco significa "cualquiera". Las filas sin importe legible se
 * apartan con su motivo en vez de entrar como cero — un cero silencioso es una tarifa que nadie
 * puso.
 */
export function parseRateTableSheet(
  matrix: SheetMatrix,
  keyColumns: VarKey[],
  analysis: Pick<RateTableSheetAnalysis, 'firstDataRow' | 'mapping'>,
  format: NumberFormat = 'auto',
): ParsedRateTable {
  const { mapping, firstDataRow } = analysis;
  const rows: ParsedRateTableRow[] = [];
  const skipped: RateTableProblem[] = [];

  if (mapping.amount === null) return { rows, skipped };

  for (let i = firstDataRow; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    if (row.every((c) => text(c) === '')) continue;

    const key = keyColumns.map((_c, k) => {
      const columna = mapping.key[k];
      const value = columna === null || columna === undefined ? '' : text(row[columna]);
      return value === '' ? RATE_TABLE_WILDCARD : value;
    });

    const rawAmount = text(row[mapping.amount]);
    const amount = parseAmount(rawAmount, format);

    if (amount === null) {
      // Una fila cuya clave está entera en comodines y sin importe es casi siempre una línea de
      // separación o un total: apartarla con motivo evita una lista de "problemas" llena de ruido.
      if (key.every((v) => v === RATE_TABLE_WILDCARD)) continue;
      skipped.push({
        sourceRow: i,
        key,
        reason: rawAmount ? `El importe "${rawAmount}" no es un número.` : 'Sin importe.',
      });
      continue;
    }

    rows.push({ key, amount, rawAmount, sourceRow: i });
  }

  return { rows, skipped };
}

/**
 * Claves repetidas dentro del archivo.
 *
 * Importan porque dos filas con la misma clave son igual de específicas para el motor: elegiría una
 * por orden y el importe saldría por sorteo. La carga masiva las resuelve pisando (gana la última),
 * pero el usuario tiene que verlo ANTES de aceptar.
 */
export function findDuplicateKeys(rows: ParsedRateTableRow[]): string[][] {
  const vistas = new Map<string, number>();
  const repetidas: string[][] = [];

  for (const row of rows) {
    const huella = row.key.map((v) => v.toUpperCase()).join(' | ');
    const previas = vistas.get(huella) ?? 0;
    if (previas === 1) repetidas.push(row.key);
    vistas.set(huella, previas + 1);
  }

  return repetidas;
}
