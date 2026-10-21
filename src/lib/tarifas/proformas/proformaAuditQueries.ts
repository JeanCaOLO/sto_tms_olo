// Lectura de la bitácora de proformas (solo lectura: la bitácora no se edita ni se borra).

import { db } from '../data';
import type { FilaAuditoria } from '../../liquidador/auditLog';

export type ProformaEvent = FilaAuditoria;

const EVENTS_LIMIT = 200;

/** Eventos de proformas, el más nuevo primero. Con `proformaId`, solo los de esa proforma. */
export async function listProformaEvents(proformaId?: string): Promise<ProformaEvent[]> {
  const where = [{ column: 'entity', op: 'eq' as const, value: 'proforma' }];
  if (proformaId) where.push({ column: 'entity_id', op: 'eq', value: proformaId });
  return (await db().find('auditLog', {
    where,
    orderBy: [{ column: 'created_at', direction: 'desc' }],
    limit: EVENTS_LIMIT,
  })) as ProformaEvent[];
}
