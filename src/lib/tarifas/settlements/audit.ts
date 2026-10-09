// Auditoría de liquidaciones.

import { registrarEvento } from '../../liquidador/auditLog';
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

/**
 * La bitácora de las liquidaciones se escribe ACÁ, junto a la escritura que registra — no en la
 * pantalla —, para que ningún camino (emitir, re-liquidar, cambiar estado) quede sin rastro.
 */
export async function auditar(
  accion: 'CREATE' | 'UPDATE' | 'AUTHORIZE',
  entidadId: string,
  antes: unknown,
  despues: unknown,
  motivo: string | undefined,
): Promise<void> {
  // La bitácora no debe tumbar una liquidación ya guardada: si falla, la operación sigue valiendo.
  try {
    await registrarEvento({
      entidad: 'settlement',
      entidadId,
      accion,
      usuario: usuarioActual(),
      rol: getActorRole(),
      antes,
      despues,
      ...(motivo ? { motivo } : {}),
    });
  } catch (error) {
    console.error('[tarifas] No se pudo registrar la bitácora de la liquidación', error);
  }
}
