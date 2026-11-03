/**
 * Helper for getting the local date in ISO format (YYYY-MM-DD).
 * Uses the browser's local time zone, not UTC.
 */
export function todayLocalIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert a Date object to local ISO format (YYYY-MM-DD).
 */
export function dateToLocalIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Día (YYYY-MM-DD) de un instante, en la zona del navegador. El backend manda los instantes en UTC ("…Z"): cortar el
 * texto con `slice(0, 10)` muestra el día UTC y un evento de la tarde en UTC-6 aparece con la fecha del día siguiente.
 * Una fecha sin hora ya es un día de calendario y se devuelve tal cual. Vacío o inválido = ''.
 */
export function formatLocalDate(iso: string | null | undefined): string {
  if (!iso) return '';
  if (DATE_ONLY.test(iso)) return iso;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateToLocalIso(date);
}

/** Fecha y hora (YYYY-MM-DD HH:mm) de un instante, en la zona del navegador. Vacío o inválido = ''. */
export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${dateToLocalIso(date)} ${hh}:${mm}`;
}

