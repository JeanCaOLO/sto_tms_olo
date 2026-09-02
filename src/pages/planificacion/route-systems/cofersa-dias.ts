// Lectura del calendario COFERSA (cofersa.json) para el flujo de "Nueva Ruta":
// qué zonas están programadas cada día de la semana. Mismo patrón de fetch que
// `use-route-system.ts`. No parsea Excel; consume el JSON ya generado.
import type { DiaEstado, DiaSemana } from './parse';
import { DIAS_SEMANA } from './parse';

export type { DiaSemana } from './parse';

/** Una zona COFERSA con su número de ruta y su calendario semanal. */
export interface CofersaDia {
  numero: number;
  zona: string;
  categoria: string;
  citaPrevia: boolean;
  dias: Record<DiaSemana, DiaEstado>;
}

// Forma cruda de cada fila en cofersa.json (columnas por día + metadatos).
type RawCofersaRow = {
  zona?: unknown;
  categoria?: unknown;
  citaPrevia?: unknown;
} & Partial<Record<DiaSemana, unknown>>;

function toDiaEstado(v: unknown): DiaEstado {
  return v === 'carga' || v === 'entrega' || v === 'ambos' || v === 'cita' ? v : null;
}

/** Normaliza una fila cruda del JSON a `CofersaDia`. */
export function toCofersaDia(row: RawCofersaRow): CofersaDia {
  const zona = String(row.zona ?? '').trim();
  const dias = {} as Record<DiaSemana, DiaEstado>;
  for (const d of DIAS_SEMANA) dias[d] = toDiaEstado(row[d]);
  return {
    // numero: primer entero que aparezca en la zona ("1 Casco"→1,
    // "Upala 31"→31). parseInt sólo lee un prefijo, así que buscamos el token.
    numero: parseInt(zona, 10) || parseInt((zona.match(/\d+/)?.[0] ?? ''), 10) || NaN,
    zona,
    categoria: String(row.categoria ?? '').trim(),
    citaPrevia: row.citaPrevia === true,
    dias,
  };
}

/**
 * Carga y normaliza el calendario COFERSA desde el JSON estático.
 * Mismo patrón que `use-route-system.ts`: respeta `import.meta.env.BASE_URL`.
 */
export async function cargaCofersaDias(): Promise<CofersaDia[]> {
  const url = `${import.meta.env.BASE_URL}data/route-systems/cofersa.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cofersa.json: HTTP ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data.map((r) => toCofersaDia(r as RawCofersaRow)) : [];
}

/**
 * Números de zona con actividad (`dias[diaSemana] !== null`) ese día. Las de
 * cita previa NO entran aquí (van aparte, activas siempre). Se descartan las
 * zonas sin número parseable (NaN).
 */
export function rutasActivas(cofersa: CofersaDia[], diaSemana: DiaSemana): number[] {
  return cofersa
    .filter((c) => !c.citaPrevia && c.dias[diaSemana] !== null && !Number.isNaN(c.numero))
    .map((c) => c.numero);
}
