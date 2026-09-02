// Mapeo puro Excel -> JSON de los sistemas de rutas/viajes de referencia.
// Sin dependencias (no importa `xlsx`): recibe una matriz de celdas
// (`unknown[][]`, tal cual la entrega `sheet_to_json(ws, { header: 1 })`) y
// devuelve filas normalizadas. El script `scripts/build-route-systems.ts` lee
// los .xlsx y llama a estas funciones; los tests las ejercen directamente.

export type Cell = string | number | boolean | null;
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

/** Los 6 días laborables, en orden, como claves de columna de la matriz. */
export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

// Normaliza un token de día a su clave canónica (sin acentos, singular).
const DIA_ALIASES: Record<string, DiaSemana> = {
  lunes: 'lunes',
  martes: 'martes',
  miercoles: 'miercoles',
  jueves: 'jueves',
  viernes: 'viernes',
  sabado: 'sabado',
};

function quitarAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Convierte un texto libre de días ("Lunes -Miercoles-Viernes",
 * "Martes-Jueves-Sabado", "Lunes a Viernes", "jueves", "Cita Previa", null)
 * en el conjunto de días que menciona. Soporta listas separadas por
 * `-`, `,`, `/` o espacios, y el rango "X a Y". Texto no reconocido
 * (p. ej. "Cita Previa") devuelve un set vacío.
 */
export function parseDias(texto: string | null): Set<DiaSemana> {
  const out = new Set<DiaSemana>();
  if (!texto) return out;
  const limpio = quitarAcentos(texto.toLowerCase());

  // Rango "lunes a viernes" -> todos los días entre ambos (inclusive).
  const rango = limpio.match(/(lunes|martes|miercoles|jueves|viernes|sabado)\s+a\s+(lunes|martes|miercoles|jueves|viernes|sabado)/);
  if (rango) {
    const i = DIAS_SEMANA.indexOf(rango[1] as DiaSemana);
    const j = DIAS_SEMANA.indexOf(rango[2] as DiaSemana);
    if (i >= 0 && j >= 0) {
      for (let k = Math.min(i, j); k <= Math.max(i, j); k++) out.add(DIAS_SEMANA[k]);
      return out;
    }
  }

  for (const token of limpio.split(/[-,/\s]+/).filter(Boolean)) {
    const dia = DIA_ALIASES[token];
    if (dia) out.add(dia);
  }
  return out;
}

/**
 * Estado de un día para una zona:
 * - 'carga'   → día de carga.
 * - 'entrega' → día de entrega.
 * - 'ambos'   → carga y entrega el MISMO día (rutas GAM entre semana).
 * - 'cita'    → cita previa; en la práctica aplica a nivel de FILA
 *   (`citaPrevia`), no de día, por lo que los días de una fila cita quedan en
 *   `null`. Se incluye en la unión por completitud del modelo.
 * - `null`    → sin actividad.
 */
export type DiaEstado = 'carga' | 'entrega' | 'ambos' | 'cita' | null;

/** ¿El texto de días indica "cita previa"? (case/acentos-insensible.) */
function esCitaPrevia(texto: string | null): boolean {
  if (!texto) return false;
  return quitarAcentos(texto.toLowerCase()).includes('cita previa');
}

/**
 * Enriquece las filas COFERSA con una clave por día (lunes..sabado) y, cuando
 * aplica, `citaPrevia: true`. Reglas (en orden):
 *
 * 1. Cita previa: si `diasCarga` contiene "cita previa" → los 6 días a `null`
 *    y `citaPrevia: true`. No tiene días fijos (ej. "44 REY").
 * 2. GAM sin split explícito: si `categoria === 'GAM'` y no hay un split real
 *    (ambas listas vacías, o sólo `diasCarga === "Lunes a Viernes"` sin
 *    entrega) → Lunes..Viernes = 'ambos', Sábado = null. Refleja el negocio:
 *    las rutas GAM cargan y entregan el mismo día de lunes a viernes.
 * 3. Resto (incluidas las GAM con split explícito, ej. EPA 33-38): 'carga' si
 *    el día está en diasCarga, 'entrega' si está en diasEntrega, 'ambos' si
 *    está en ambas listas explícitas, `null` si en ninguna.
 */
export function expandirDiasCofersa(row: Row): Row {
  const diasCarga = str(row.diasCarga);
  const diasEntrega = str(row.diasEntrega);

  // Regla 1: cita previa (nivel de fila).
  if (esCitaPrevia(diasCarga)) {
    const dias: Record<string, Cell> = {};
    for (const d of DIAS_SEMANA) dias[d] = null;
    return { ...row, ...dias, citaPrevia: true };
  }

  const carga = parseDias(diasCarga);
  const entrega = parseDias(diasEntrega);

  // Regla 2: GAM sin split explícito → lunes..viernes 'ambos'.
  const categoria = str(row.categoria)?.toUpperCase();
  const soloLunesAViernes =
    entrega.size === 0 && diasEntrega == null && diasCarga != null &&
    quitarAcentos(diasCarga.toLowerCase()).replace(/\s+/g, ' ').trim() === 'lunes a viernes';
  const sinSplit = carga.size === 0 && entrega.size === 0;
  if (categoria === 'GAM' && (sinSplit || soloLunesAViernes)) {
    const dias: Record<string, Cell> = {};
    for (const d of DIAS_SEMANA) dias[d] = d === 'sabado' ? null : 'ambos';
    return { ...row, ...dias };
  }

  // Regla 3: split explícito. Día en ambas listas → 'ambos'.
  const dias: Record<string, Cell> = {};
  for (const d of DIAS_SEMANA) {
    const c = carga.has(d);
    const e = entrega.has(d);
    dias[d] = c && e ? 'ambos' : c ? 'carga' : e ? 'entrega' : null;
  }
  return { ...row, ...dias };
}

export function parseCofersa(rows: unknown[][]): Row[] {
  const h = findRow(rows, (r) => str(r[0])?.toLowerCase() === 'zona #');
  if (h < 0) throw new Error('COFERSA: no se encontró la cabecera "Zona #"');
  return rows
    .slice(h + 1)
    .filter((r) => str(r[0]))
    .map((r) =>
      expandirDiasCofersa({
        zona: str(r[0]),
        categoria: str(r[1]),
        diasCarga: str(r[2]),
        diasEntrega: str(r[3]),
      }),
    );
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
