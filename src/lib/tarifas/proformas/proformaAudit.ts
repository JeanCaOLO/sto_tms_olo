// Bitácora de proformas: fila para insertar en la MISMA transacción que la escritura que registra.

import { eventoToRow } from '../../liquidador/auditLog';
import { getActorRole } from '../actor';
import { usuarioActual } from '../settlements/audit';

export type ProformaAction = 'CREATE' | 'UPDATE' | 'AUTHORIZE';

/** Los cambios de configuración (fases, correo) cuelgan de `config:<país>` en vez de una proforma. */
export const CONFIG_ID_PREFIX = 'config:';

export function proformaConfigAuditRow(
  countryId: string, before: unknown, after: unknown, reason: string,
): Record<string, unknown> {
  return proformaAuditRow('UPDATE', `${CONFIG_ID_PREFIX}${countryId}`, before, after, reason);
}

export function proformaAuditRow(
  action: ProformaAction, proformaId: string, before: unknown, after: unknown, reason?: string,
): Record<string, unknown> {
  return eventoToRow({
    entidad: 'proforma',
    entidadId: proformaId,
    accion: action,
    usuario: usuarioActual(),
    rol: getActorRole(),
    antes: before,
    despues: after,
    ...(reason ? { motivo: reason } : {}),
  });
}
