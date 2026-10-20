// Bitácora de proformas: fila para insertar en la MISMA transacción que la escritura que registra.

import { eventoToRow } from '../../liquidador/auditLog';
import { getActorRole } from '../actor';
import { usuarioActual } from '../settlements/audit';

export type ProformaAction = 'CREATE' | 'UPDATE' | 'AUTHORIZE';

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
