// Importación de TARIFAS BASE por tipo de vehículo.
//
// Forma esperada del archivo: dos columnas útiles — tipo de camión y precio. Todo lo demás (a qué
// transportista van, en qué moneda están) se elige en el importador, no se lee del archivo: son
// datos que la planilla casi nunca trae y que adivinarlos sería inventar.
//
// El precio se acepta en cualquier formato: "20", "20$", "20 $", "$ 1.200,50", "₡20.000". De la
// celda se saca el NÚMERO y nada más.
//
// Módulo PURO: recibe una matriz de celdas, no un archivo.

import { detectHeaderRow, parseAmount, type NumberFormat, type SheetMatrix } from './costSheetParser';

export interface RateColumnMapping {
  truckType: number | null;
  price: number | null;
}

export interface RateSheetAnalysis {
  headerRow: number;
  firstDataRow: number;
  headers: string[];
  mapping: RateColumnMapping;
  notes: string[];
}

export interface ParsedRate {
  truckType: string;
  /** Decimal en texto, ya limpio de símbolos. */
  price: string;
  /** Valor original de la celda, para mostrarlo al lado en la vista previa. */
  rawPrice: string;
  sourceRow: number;
}

export interface RateProblem {
  sourceRow: number;
  truckType: string;
  reason: string;
}

export interface ParsedRates {
  rates: ParsedRate[];
  skipped: RateProblem[];
}

function text(cell: string | number | null | undefined): string {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

// Encabezados típicos de cada columna, en las formas en que la gente los escribe.
const TRUCK_HEADERS = /tipo|camion|camión|veh[ií]culo|unidad|modelo|clase/i;
const PRICE_HEADERS = /tarifa|precio|monto|costo|valor|importe|rate/i;

/**
 * Propone qué columna es cuál. Primero por el nombre del encabezado —que es lo que una persona
 * miraría— y si eso no alcanza, por el contenido: la primera de texto es el tipo, la primera
 * numérica es el precio.
 */
export function analyzeRateSheet(matrix: SheetMatrix): RateSheetAnalysis {
  const notes: string[] = [];
  const detected = detectHeaderRow(matrix);
  const headerRow = detected === -1 ? 0 : detected;
  const firstDataRow = detected === -1 ? 0 : headerRow + 1;

  if (detected === -1) {
    notes.push('No se encontró una fila de encabezado: se toma el archivo desde la primera fila.');
  } else if (headerRow > 0) {
    notes.push(`Se saltearon ${headerRow} fila(s) de título antes del encabezado.`);
  }

  const width = Math.max(0, ...matrix.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => text(matrix[headerRow]?.[i]) || `Columna ${i + 1}`);
  const dataRows = matrix.slice(firstDataRow);

  let truckType: number | null = null;
  let price: number | null = null;

  // 1) Por nombre de encabezado.
  headers.forEach((header, index) => {
    if (truckType === null && TRUCK_HEADERS.test(header)) truckType = index;
    if (price === null && PRICE_HEADERS.test(header)) price = index;
  });

  // 2) Por contenido, para lo que haya quedado sin resolver.
  for (let col = 0; col < width; col += 1) {
    const values = dataRows.map((r) => text(r[col])).filter((v) => v !== '');
    if (values.length === 0) continue;

    const numericos = values.filter((v) => parseAmount(v) !== null).length;
    const mayoriaNumerica = numericos / values.length >= 0.7;

    if (price === null && mayoriaNumerica && col !== truckType) price = col;
    if (truckType === null && !mayoriaNumerica && col !== price) truckType = col;
  }

  if (truckType === null) notes.push('No se identificó la columna del tipo de vehículo.');
  if (price === null) notes.push('No se identificó la columna del precio.');

  return { headerRow, firstDataRow, headers, mapping: { truckType, price }, notes };
}

const TOTAL_PATTERN = /^\s*(total|suma|subtotal)\b/i;

export function parseRateRows(
  matrix: SheetMatrix,
  firstDataRow: number,
  mapping: RateColumnMapping,
  format: NumberFormat = 'auto',
): ParsedRates {
  const rates: ParsedRate[] = [];
  const skipped: RateProblem[] = [];
  const seen = new Map<string, number>();

  for (let i = firstDataRow; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const sourceRow = i + 1; // 1-based, como numera Excel

    const truckType = mapping.truckType === null ? '' : text(row[mapping.truckType]);
    const rawPrice = mapping.price === null ? '' : text(row[mapping.price]);

    if (!truckType && !rawPrice) continue; // fila vacía: separación, no problema

    if (!truckType) {
      skipped.push({ sourceRow, truckType: '(vacío)', reason: 'La fila no indica el tipo de vehículo.' });
      continue;
    }
    if (TOTAL_PATTERN.test(truckType)) {
      skipped.push({ sourceRow, truckType, reason: 'Es una fila de total, no una tarifa.' });
      continue;
    }

    const price = parseAmount(rawPrice, format);
    if (price === null) {
      skipped.push({
        sourceRow,
        truckType,
        reason: rawPrice ? `No se pudo leer un número en "${rawPrice}".` : 'La fila no tiene precio.',
      });
      continue;
    }
    if (Number(price) < 0) {
      skipped.push({ sourceRow, truckType, reason: 'El precio es negativo.' });
      continue;
    }

    // El tipo de vehículo es la clave de la tarifa: repetirlo dentro del mismo archivo deja en duda
    // cuál de los dos precios vale.
    const key = truckType.toUpperCase();
    const previo = seen.get(key);
    if (previo !== undefined) {
      skipped.push({
        sourceRow,
        truckType,
        reason: `Repetido: ya aparece en la fila ${previo}. Dejá una sola tarifa por tipo de vehículo.`,
      });
      continue;
    }
    seen.set(key, sourceRow);

    rates.push({ truckType, price, rawPrice: rawPrice || price, sourceRow });
  }

  return { rates, skipped };
}
