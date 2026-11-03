// Rango de fechas de las secciones de proformas: hoy (por defecto), semana, mes, rango propio o todo.
// Las fechas son locales ('YYYY-MM-DD'); el rango es inclusivo en ambos extremos.

export type RangePreset = 'today' | 'week' | 'month' | 'custom' | 'all';

export interface DateRange {
  preset: RangePreset;
  /** 'YYYY-MM-DD'. Vacío = sin límite inferior. */
  from: string;
  /** 'YYYY-MM-DD'. Vacío = sin límite superior. */
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** El rango de un preset respecto de `today`. 'custom' conserva lo que el usuario escribió. */
export function rangeFor(preset: RangePreset, today: Date = new Date(), custom?: { from: string; to: string }): DateRange {
  if (preset === 'all') return { preset, from: '', to: '' };
  if (preset === 'custom') return { preset, from: custom?.from ?? '', to: custom?.to ?? '' };
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === 'today') return { preset, from: toDateKey(end), to: toDateKey(end) };
  if (preset === 'week') {
    const monday = new Date(end);
    monday.setDate(end.getDate() - ((end.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { preset, from: toDateKey(monday), to: toDateKey(sunday) };
  }
  return {
    preset,
    from: toDateKey(new Date(end.getFullYear(), end.getMonth(), 1)),
    to: toDateKey(new Date(end.getFullYear(), end.getMonth() + 1, 0)),
  };
}

export const TODAY_RANGE = (): DateRange => rangeFor('today');

/** Límites como instantes ISO (hora local), para filtrar columnas timestamptz. Vacío = sin límite. */
export function rangeToIso(range: DateRange): { from: string | null; to: string | null } {
  return {
    from: range.from ? new Date(`${range.from}T00:00:00`).toISOString() : null,
    to: range.to ? new Date(`${range.to}T23:59:59.999`).toISOString() : null,
  };
}

/** ¿Cae el instante `iso` dentro del rango (por día local)? Un valor vacío o inválido no cae. */
export function inRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const key = toDateKey(date);
  return (!range.from || key >= range.from) && (!range.to || key <= range.to);
}
