// Estado de vencimiento de una fecha (licencia de conductor, contrato de
// transportista, etc.). Puro y sin dependencias para poder testearlo y
// reusarlo en las alertas visuales del front.
//
// Reglas (pedido del usuario): avisar cuando falte 1 mes para vencer
// ('due_soon') y cuando ya esté vencido ('expired').

export type ExpiryStatus = 'ok' | 'due_soon' | 'expired' | 'none';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días calendario desde hoy hasta `date` (negativo si ya pasó). `today` inyectable para test. */
export function daysUntil(date: string | Date | null | undefined, today: Date = new Date()): number | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date + (date.length === 10 ? 'T00:00:00' : '')) : date;
  if (isNaN(d.getTime())) return null;
  // Comparar a medianoche local para contar días calendario, no horas.
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / DAY_MS);
}

/**
 * Estado de vencimiento. `warningDays` = ventana de "por vencer" (default 30,
 * ~1 mes). 'none' cuando no hay fecha.
 */
export function expiryStatus(
  date: string | Date | null | undefined,
  today: Date = new Date(),
  warningDays = 30,
): ExpiryStatus {
  const days = daysUntil(date, today);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= warningDays) return 'due_soon';
  return 'ok';
}
