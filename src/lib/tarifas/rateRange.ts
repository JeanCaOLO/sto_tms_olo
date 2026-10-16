// Rangos en la clave de un tarifario: "0..100", "101..300", "301..".
//
// Una celda de clave normalmente es un valor exacto o un comodín. Para magnitudes (km, kg, paradas)
// el valor exacto no sirve —181 no casa con 180—, así que la celda puede ser un RANGO con ambos
// extremos incluidos; un extremo vacío es abierto ("301.." = de 301 en adelante, "..100" = hasta 100).
// También se acepta el guion de Excel ("101-300") entre dos números.
//
// Módulo PURO.

export interface NumericRange {
  from: number | null;
  to: number | null;
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const RANGE_SHAPE = new RegExp(String.raw`^\s*(${NUMBER})?\s*(?:\.\.|–|—|-)\s*(${NUMBER})?\s*$`);

const toNumber = (raw: string) => Number(raw.replace(',', '.'));

/** La celda como rango, o null si es un valor exacto, un comodín o no se entiende. */
export function parseRange(cell: string | number | null | undefined): NumericRange | null {
  if (typeof cell !== 'string') return null;
  const match = RANGE_SHAPE.exec(cell);
  if (!match) return null;
  const [, rawFrom, rawTo] = match;
  if (rawFrom === undefined && rawTo === undefined) return null;
  return {
    from: rawFrom === undefined ? null : toNumber(rawFrom),
    to: rawTo === undefined ? null : toNumber(rawTo),
  };
}

export const isRangeCell = (cell: string | number | null | undefined): boolean => parseRange(cell) !== null;

/** ¿Cae el valor dentro del rango? Ambos extremos incluidos. */
export function inRange(value: number, range: NumericRange): boolean {
  if (!Number.isFinite(value)) return false;
  if (range.from !== null && value < range.from) return false;
  if (range.to !== null && value > range.to) return false;
  return true;
}

/** ¿Se pisan dos rangos? (Comparten al menos un valor.) */
export function rangesOverlap(a: NumericRange, b: NumericRange): boolean {
  const aFrom = a.from ?? Number.NEGATIVE_INFINITY;
  const aTo = a.to ?? Number.POSITIVE_INFINITY;
  const bFrom = b.from ?? Number.NEGATIVE_INFINITY;
  const bTo = b.to ?? Number.POSITIVE_INFINITY;
  return aFrom <= bTo && bFrom <= aTo;
}

/** Forma canónica, para mostrar y comparar: "101..300", "301..", "..100". */
export function formatRange(range: NumericRange): string {
  return `${range.from ?? ''}..${range.to ?? ''}`;
}
