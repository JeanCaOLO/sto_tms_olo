// Lectura de planillas de estructura de costos.
//
// EL PROBLEMA REAL: ninguna planilla viene igual. La de ejemplo tiene 5 hojas y las 5 tienen forma
// distinta — una es de pares clave/valor, dos son tablas de 2 columnas, una de 4 y otra de 10, y en
// ninguna el encabezado está en la primera fila (arriba hay título y subtítulo). Un parser que
// asuma "columna A = concepto, columna B = monto" funciona solo con este archivo.
//
// Por eso acá no se interpreta NADA: se detectan candidatos y se propone un mapeo, que la persona
// confirma o corrige antes de importar. El módulo es PURO — recibe una matriz de celdas, no un
// archivo — así que se puede probar sin abrir un Excel.

import type { CostDriver } from './types';

/** Una hoja convertida a matriz: filas de celdas crudas, tal como las devuelve la librería. */
export type SheetMatrix = (string | number | null)[][];

export type TargetField = 'label' | 'amount' | 'unit' | 'code' | 'ignore';

export interface ColumnCandidate {
  index: number;
  /** Encabezado tal como aparece en la planilla. */
  header: string;
  /** Qué parece contener, mirando las filas de datos. */
  kind: 'text' | 'number' | 'mixed' | 'empty';
  /** Campo propuesto. La persona puede cambiarlo. */
  suggested: TargetField;
  /** Primeros valores, para que se vea qué se está mapeando. */
  sample: (string | number | null)[];
}

export interface SheetAnalysis {
  /** Índice de la fila que parece ser el encabezado. -1 si no se encontró. */
  headerRow: number;
  /** Primera fila de datos. */
  firstDataRow: number;
  columns: ColumnCandidate[];
  /** Moneda deducida del encabezado ("Monto Mensual (₡)" -> "CRC"), si se pudo. */
  detectedCurrency: string | null;
  /** Driver propuesto para toda la hoja, deducido de sus títulos. */
  suggestedDriver: CostDriver;
  notes: string[];
}

// ── Utilidades de celda ───────────────────────────────────────────────────────────────────────

function isBlank(cell: string | number | null | undefined): boolean {
  return cell === null || cell === undefined || String(cell).trim() === '';
}

function text(cell: string | number | null | undefined): string {
  return isBlank(cell) ? '' : String(cell).trim();
}

/**
 * Cómo interpretar los separadores de un número.
 *   'es'   -> 1.234,56  (coma decimal, punto de miles) — Costa Rica, Venezuela, Colombia
 *   'en'   -> 1,234.56  (punto decimal, coma de miles) — formato anglosajón
 *   'auto' -> se deduce de cada celda
 *
 * Existe porque hay casos IMPOSIBLES de resolver mirando la celda sola: "20.000" son veinte mil en
 * formato español y veinte en inglés, y las dos lecturas son plausibles para un precio. En un
 * sistema que va a operar en varios países, adivinar mal eso es equivocarse por mil.
 */
export type NumberFormat = 'auto' | 'es' | 'en';

/**
 * Convierte una celda a número decimal EN TEXTO. Devuelve null si no es un número.
 *
 * Acepta las formas que aparecen en planillas reales: separadores de miles, coma decimal, símbolo
 * de moneda, paréntesis para negativos y espacios finos. Se devuelve string y no `number` porque el
 * kernel trabaja con decimales exactos: convertir a `number` a mitad de camino perdería precisión.
 */
export function parseAmount(
  cell: string | number | null | undefined,
  format: NumberFormat = 'auto',
): string | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : null;

  let raw = String(cell).trim();
  if (!raw) return null;

  const negativeByParens = /^\(.*\)$/.test(raw);
  if (negativeByParens) raw = raw.slice(1, -1);

  // Fuera símbolos de moneda, espacios (incluido el fino) y todo lo que no sea dígito o separador.
  raw = raw.replace(/[^\d,.\-]/g, '');
  if (!raw || raw === '-') return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');

  if (format === 'es') {
    raw = raw.replace(/\./g, '');
    if (raw.includes(',')) raw = raw.replace(/,(?=[^,]*$)/, '.').replace(/,/g, '');
  } else if (format === 'en') {
    raw = raw.replace(/,/g, '');
  } else if (lastComma > -1 && lastDot > -1) {
    // Los dos presentes: el que está más a la derecha es el decimal. Acá no hay ambigüedad.
    if (lastComma > lastDot) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Solo coma: decimal si deja 1-2 dígitos a la derecha; si no, es separador de miles.
    const decimals = raw.length - lastComma - 1;
    raw = decimals > 0 && decimals <= 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
  }
  // Solo punto y modo automático: se deja como decimal, que es la lectura de JavaScript. Es la
  // única lectura posible sin más contexto — y por eso el importador ofrece elegir el formato.

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return String(negativeByParens ? -value : value);
}

/**
 * Criterio ESTRICTO, solo para clasificar columnas: una celda con letras no es un número, por más
 * que tenga dígitos adentro.
 *
 * `parseAmount` es deliberadamente permisivo —si alguien mapea una columna como importe, "1 UND"
 * vale 1— pero esa permisividad no sirve para adivinar el tipo de una columna: con ella, un
 * concepto como "Costo por KM (tipo T3)" contaba como número y la columna de conceptos dejaba de
 * parecer de texto. Verificado contra la planilla real.
 */
function looksLikeNumber(cell: string | number | null): boolean {
  if (typeof cell === 'number') return Number.isFinite(cell);
  if (isBlank(cell)) return false;
  if (/\p{L}/u.test(String(cell))) return false;
  return parseAmount(cell) !== null;
}

function looksNumeric(cell: string | number | null): boolean {
  return looksLikeNumber(cell);
}

// ── Detección de encabezado ───────────────────────────────────────────────────────────────────

/**
 * Busca la fila de encabezado. El criterio: la primera fila con al menos dos celdas de texto no
 * vacías cuya fila SIGUIENTE tenga al menos un número. Es lo que distingue un encabezado
 * ("Concepto | Monto Mensual") de un título suelto ("Costos del Conductor").
 */
export function detectHeaderRow(matrix: SheetMatrix): number {
  for (let i = 0; i < Math.min(matrix.length - 1, 25); i += 1) {
    const row = matrix[i] ?? [];
    const textCells = row.filter((c) => !isBlank(c) && !looksNumeric(c));
    if (textCells.length < 2) continue;

    const next = matrix[i + 1] ?? [];
    if (next.some((c) => looksNumeric(c))) return i;
  }
  return -1;
}

// ── Detección de moneda y driver ──────────────────────────────────────────────────────────────

// VES fue retirado: el módulo no opera en bolívares en ningún país (Venezuela liquida en USD,
// ver R29) — dejar el patrón acá volvería a permitir que una hoja de costos se detecte en una
// moneda que el motor nunca podría usar.
const CURRENCY_HINTS: { pattern: RegExp; currency: string }[] = [
  { pattern: /₡|colon|crc/i, currency: 'CRC' },
  { pattern: /\$|usd|dolar|dólar/i, currency: 'USD' },
  { pattern: /cop|peso colombiano/i, currency: 'COP' },
];

export function detectCurrency(texts: string[]): string | null {
  const joined = texts.join(' ');
  return CURRENCY_HINTS.find((h) => h.pattern.test(joined))?.currency ?? null;
}

const DRIVER_HINTS: { pattern: RegExp; driver: CostDriver }[] = [
  { pattern: /por\s*km|\/\s*km|kil[oó]metro/i, driver: 'PER_KM' },
  { pattern: /mensual|por\s*mes|\/\s*mes/i, driver: 'PER_MONTH_PRORATED' },
  { pattern: /diario|por\s*d[ií]a|\/\s*d[ií]a/i, driver: 'PER_DAY' },
  { pattern: /por\s*hora|\/\s*hora/i, driver: 'PER_HOUR' },
  { pattern: /por\s*bulto|por\s*entrega/i, driver: 'PER_PACKAGE' },
  { pattern: /por\s*parada|por\s*cliente/i, driver: 'PER_CLIENT' },
];

/** Driver propuesto, mirando títulos y encabezados. La persona lo confirma fila por fila. */
export function detectDriver(texts: string[]): CostDriver {
  const joined = texts.join(' ');
  return DRIVER_HINTS.find((h) => h.pattern.test(joined))?.driver ?? 'FIXED';
}

// ── Análisis de una hoja ──────────────────────────────────────────────────────────────────────

// Clasificación por MAYORÍA, no por pureza: en una planilla real siempre hay una celda con una
// nota suelta, y con el criterio estricto una sola de ellas descalificaba a toda la columna.
const MAYORIA = 0.7;

function classifyColumn(values: (string | number | null)[]): ColumnCandidate['kind'] {
  const filled = values.filter((v) => !isBlank(v));
  if (filled.length === 0) return 'empty';

  const numbers = filled.filter((v) => looksLikeNumber(v)).length;
  const ratio = numbers / filled.length;

  if (ratio >= MAYORIA) return 'number';
  if (ratio <= 1 - MAYORIA) return 'text';
  return 'mixed';
}

export function analyzeSheet(matrix: SheetMatrix): SheetAnalysis {
  const notes: string[] = [];
  const headerRow = detectHeaderRow(matrix);
  const firstDataRow = headerRow === -1 ? 0 : headerRow + 1;

  if (headerRow === -1) {
    notes.push('No se encontró una fila de encabezado: elegila a mano antes de importar.');
  } else if (headerRow > 0) {
    notes.push(`Se salteó${headerRow > 1 ? 'n' : ''} ${headerRow} fila(s) de título antes del encabezado.`);
  }

  const width = Math.max(0, ...matrix.map((r) => r.length));
  const dataRows = matrix.slice(firstDataRow);

  const columns: ColumnCandidate[] = [];
  let amountAssigned = false;
  let labelAssigned = false;

  for (let col = 0; col < width; col += 1) {
    const values = dataRows.map((r) => r[col] ?? null);
    const kind = classifyColumn(values);
    const header = headerRow === -1 ? `Columna ${col + 1}` : text(matrix[headerRow]?.[col]) || `Columna ${col + 1}`;

    // Se propone la PRIMERA columna de texto como etiqueta y la PRIMERA numérica como importe, que
    // es la forma de la enorme mayoría de las planillas. Todo lo demás se ignora por defecto: es
    // preferible que la persona active una columna a que se importe algo que no vio.
    let suggested: TargetField = 'ignore';
    if (!labelAssigned && kind === 'text') {
      suggested = 'label';
      labelAssigned = true;
    } else if (!amountAssigned && kind === 'number') {
      suggested = 'amount';
      amountAssigned = true;
    }

    columns.push({ index: col, header, kind, suggested, sample: values.slice(0, 3) });
  }

  if (!labelAssigned) notes.push('No se detectó una columna de texto para el concepto.');
  if (!amountAssigned) notes.push('No se detectó ninguna columna numérica para el importe.');

  const headerTexts = (matrix[headerRow] ?? []).map(text);
  const titleTexts = matrix.slice(0, Math.max(headerRow, 0)).flat().map(text);

  return {
    headerRow,
    firstDataRow,
    columns,
    detectedCurrency: detectCurrency([...titleTexts, ...headerTexts]),
    suggestedDriver: detectDriver([...titleTexts, ...headerTexts]),
    notes,
  };
}

// ── Extracción de filas ───────────────────────────────────────────────────────────────────────

export interface ColumnMapping {
  label: number | null;
  amount: number | null;
  unit: number | null;
  code: number | null;
}

export interface ParsedCostRow {
  code: string;
  label: string;
  amount: string;
  unit: string | null;
  driver: CostDriver;
  /** Fila de la planilla, para poder señalar el problema en pantalla. */
  sourceRow: number;
}

export interface ParseProblem {
  sourceRow: number;
  label: string;
  reason: string;
}

export interface ParseResult {
  rows: ParsedCostRow[];
  /** Filas que NO se van a importar, con el motivo. Se muestran para que nadie asuma que entraron. */
  skipped: ParseProblem[];
}

// Las filas de total duplicarían todo lo de arriba. Se detectan y se descartan, pero se informa.
const TOTAL_PATTERN = /^\s*(total|suma|subtotal|gran total)\b/i;

/** Código estable a partir de la etiqueta: sin tildes, sin espacios, en mayúsculas. */
export function codeFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 40) || 'FILA';
}

export function parseCostRows(
  matrix: SheetMatrix,
  analysis: Pick<SheetAnalysis, 'firstDataRow'>,
  mapping: ColumnMapping,
  driver: CostDriver,
): ParseResult {
  const rows: ParsedCostRow[] = [];
  const skipped: ParseProblem[] = [];
  const seenCodes = new Set<string>();

  for (let i = analysis.firstDataRow; i < matrix.length; i += 1) {
    const row = matrix[i] ?? [];
    const sourceRow = i + 1; // 1-based, como lo numera Excel

    const label = mapping.label === null ? '' : text(row[mapping.label]);
    const rawAmount = mapping.amount === null ? null : row[mapping.amount] ?? null;

    if (!label && isBlank(rawAmount)) continue; // fila vacía: no es un problema, es separación

    if (!label) {
      skipped.push({ sourceRow, label: '(sin concepto)', reason: 'La fila no tiene concepto.' });
      continue;
    }
    if (TOTAL_PATTERN.test(label)) {
      skipped.push({ sourceRow, label, reason: 'Es una fila de total: sumarla duplicaría el resto.' });
      continue;
    }

    const amount = parseAmount(rawAmount);
    if (amount === null) {
      skipped.push({ sourceRow, label, reason: 'El importe no es un número.' });
      continue;
    }

    let code = mapping.code !== null && text(row[mapping.code])
      ? codeFromLabel(text(row[mapping.code]))
      : codeFromLabel(label);
    if (seenCodes.has(code)) {
      // Dos conceptos distintos pueden generar el mismo código al normalizar; se desempata para no
      // pisar una fila con otra.
      let n = 2;
      while (seenCodes.has(`${code}_${n}`)) n += 1;
      code = `${code}_${n}`;
    }
    seenCodes.add(code);

    rows.push({
      code,
      label,
      amount,
      unit: mapping.unit === null ? null : text(row[mapping.unit]) || null,
      driver,
      sourceRow,
    });
  }

  return { rows, skipped };
}
