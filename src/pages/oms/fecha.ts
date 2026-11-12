// Formateo de fechas del OMS a la zona horaria del PAÍS del contexto operativo.
//
// El backend serializa TODO timestamptz a UTC (tms_common responses.py _iso_utc:
// ISO con sufijo Z). Si lo mostráramos tal cual, el usuario vería UTC (p. ej. las
// 07:27 de Costa Rica aparecen como 13:27). Aquí lo convertimos a la hora local del
// país del contexto (countries.timezone, IANA: America/Costa_Rica, America/Caracas…).
// Fallback: Costa Rica, por ser la operación de referencia.

const FALLBACK_TZ = 'America/Costa_Rica';

// Fecha + hora con el nombre corto de la zona (p. ej. "23/10/2026, 07:27 GMT-6"),
// para que quede explícito en qué zona está la hora.
export function formatFechaHora(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat('es-CR', {
      timeZone: timeZone || FALLBACK_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZoneName: 'short',
    }).format(d);
  } catch {
    // Zona inválida (timezone mal configurado en countries): cae a la del navegador.
    return new Intl.DateTimeFormat('es-CR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  }
}
