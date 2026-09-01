// Mapeo puro Excel -> JSON de los sistemas de rutas/viajes de referencia.
// Sin dependencias (no importa `xlsx`): recibe una matriz de celdas
// (`unknown[][]`, tal cual la entrega `sheet_to_json(ws, { header: 1 })`) y
// devuelve filas normalizadas. El script `scripts/build-route-systems.ts` lee
// los .xlsx y llama a estas funciones; los tests las ejercen directamente.

export type Cell = string | number | null;
export type Row = Record<string, Cell>;

/** Texto recortado, o null si queda vacío. */
export function str(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

/** Número tal cual, o el texto recortado si no es numérico. */
function numOrStr(v: unknown): Cell {
  return typeof v === 'number' && isFinite(v) ? v : str(v);
}

/** Serial de fecha de Excel (base 1899-12-30) -> 'YYYY-MM-DD'. */
export function excelSerialToISO(v: unknown): string | null {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Enmascara un nombre propio: "ARAMIS VILLASANA" -> "A. VILLASANA". */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function findRow(rows: unknown[][], pred: (r: unknown[]) => boolean): number {
  return rows.findIndex((r) => Array.isArray(r) && pred(r));
}

function colIndexer(header: unknown[]) {
  const norm = header.map((h) => str(h)?.toLowerCase().replace(/\s+/g, ' ') ?? '');
  return (...names: string[]): number => {
    for (const n of names) {
      const i = norm.indexOf(n.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  };
}

// ---------------------------------------------------------------------------
// COFERSA — hoja "Hoja1". Cabecera: "Zona #" | (categoría) | "Días de Carga" |
// "Días de entrega". Una fila = una zona de reparto y su calendario semanal.
// ---------------------------------------------------------------------------
export function parseCofersa(rows: unknown[][]): Row[] {
  const h = findRow(rows, (r) => str(r[0])?.toLowerCase() === 'zona #');
  if (h < 0) throw new Error('COFERSA: no se encontró la cabecera "Zona #"');
  return rows
    .slice(h + 1)
    .filter((r) => str(r[0]))
    .map((r) => ({
      zona: str(r[0]),
      categoria: str(r[1]),
      diasCarga: str(r[2]),
      diasEntrega: str(r[3]),
    }));
}

// ---------------------------------------------------------------------------
// ASIGNACION DE VIAJES — hoja "PROGRAMACION DE VIAJES". Una fila = un viaje
// programado en una fecha, a un destino (estado) / localidad, con su conductor,
// prioridad, puerta de carga y los números de viaje de los 4 subsistemas
// (Febeca Patio, Febeca Bulto, Sillaca, Beval) + Viaje WMH.
// ---------------------------------------------------------------------------
export interface ProgramacionOpts {
  /** Sustituye el nombre del conductor por iniciales (PII). Default: true. */
  maskConductor?: boolean;
}

export function parseProgramacionViajes(rows: unknown[][], opts: ProgramacionOpts = {}): Row[] {
  const mask = opts.maskConductor ?? true;
  const h = findRow(
    rows,
    (r) => r.some((c) => str(c)?.toLowerCase() === 'mes') && r.some((c) => /destino/i.test(str(c) ?? '')),
  );
  if (h < 0) throw new Error('PROGRAMACION DE VIAJES: no se encontró la fila de cabecera');
  const col = colIndexer(rows[h]);
  const ix = {
    mes: col('mes'),
    fecha: col('fecha de asignacion', 'fecha asignacion', 'fecha'),
    febecaPatio: col('febeca patio viaje', 'febeca patio'),
    febecaBulto: col('febeca bulto'),
    sillaca: col('n° viaje sillaca', 'viaje sillaca'),
    beval: col('n° viaje beval', 'viaje beval'),
    destino: col('destino'),
    localidad: col('localidad referencia', 'localidad'),
    viajeWmh: col('viaje wmh'),
    prioridad: col('n° prioridad', 'prioridad'),
    guias: col('guias adicionales'),
    puerta: col('puerta de carga'),
    conductor: col('conductor'),
  };
  const at = (r: unknown[], i: number): unknown => (i >= 0 ? r[i] : undefined);

  return rows
    .slice(h + 1)
    .filter((r) => Array.isArray(r) && (str(at(r, ix.fecha)) || str(at(r, ix.destino))))
    .map((r) => {
      const conductor = str(at(r, ix.conductor));
      return {
        mes: str(at(r, ix.mes)),
        fecha: excelSerialToISO(at(r, ix.fecha)) ?? str(at(r, ix.fecha)),
        destino: str(at(r, ix.destino)),
        localidad: str(at(r, ix.localidad)),
        conductor: conductor && mask ? maskName(conductor) : conductor,
        prioridad: numOrStr(at(r, ix.prioridad)),
        puertaCarga: numOrStr(at(r, ix.puerta)),
        febecaPatio: str(at(r, ix.febecaPatio)),
        febecaBulto: str(at(r, ix.febecaBulto)),
        sillaca: str(at(r, ix.sillaca)),
        beval: str(at(r, ix.beval)),
        viajeWmh: str(at(r, ix.viajeWmh)),
        guiasAdicionales: str(at(r, ix.guias)),
      };
    });
}
