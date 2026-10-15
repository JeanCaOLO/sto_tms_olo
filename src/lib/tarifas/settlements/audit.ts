// Auditoría de liquidaciones.

import { eventoToRow, registrarEventoSeguro, type EventoAuditoria } from '../../liquidador/auditLog';
import { getActorRole } from '../actor';

/** Correo del usuario logueado (sesión del TMS, misma clave que `src/lib/supabase.ts`). */
export function usuarioActual(): string {
  try {
    const raw = localStorage.getItem('tms_session');
    const email = raw ? (JSON.parse(raw) as { user?: { email?: string } }).user?.email : undefined;
    return email || 'usuario sin sesión';
  } catch {
    return 'usuario sin sesión';
  }
}

type Accion = 'CREATE' | 'UPDATE' | 'AUTHORIZE';

function evento(
  accion: Accion,
  entidadId: string,
  antes: unknown,
  despues: unknown,
  motivo: string | undefined,
): EventoAuditoria {
  return {
    entidad: 'settlement',
    entidadId,
    accion,
    usuario: usuarioActual(),
    rol: getActorRole(),
    antes,
    despues,
    ...(motivo ? { motivo } : {}),
  };
}

/**
 * La fila de bitácora de una liquidación, para insertarla en la MISMA transacción que la escritura
 * que registra (`tx.insert('auditLog', auditRow(...))`): emitir, re-liquidar y cambiar de estado no
 * pueden quedar sin rastro ni dejar rastro de algo que no se guardó. El servidor fija el usuario y
 * el rol con los del token, así que lo que acá se manda como actor es solo un respaldo.
 */
export function auditRow(
  accion: Accion,
  entidadId: string,
  antes: unknown,
  despues: unknown,
  motivo: string | undefined,
): Record<string, unknown> {
  return eventoToRow(evento(accion, entidadId, antes, despues, motivo));
}

/**
 * Bitácora FUERA de transacción, para cambios que no son una liquidación (o cuando no hay una
 * transacción a mano). No debe tumbar lo ya guardado: si falla, la operación sigue valiendo y se avisa.
 */
export async function auditar(
  accion: Accion,
  entidadId: string,
  antes: unknown,
  despues: unknown,
  motivo: string | undefined,
): Promise<void> {
  await registrarEventoSeguro(evento(accion, entidadId, antes, despues, motivo));
}
