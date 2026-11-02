// Lectura de la bitácora de proformas (solo lectura: la bitácora no se edita ni se borra).

import { db, type Condition } from '../data';
import type { FilaAuditoria } from '../../liquidador/auditLog';
import { rangeToIso, type DateRange } from './dateRange';

export type ProformaEvent = FilaAuditoria;

const EVENTS_LIMIT = 200;

/** Eventos de proformas, el más nuevo primero. Con `proformaId`, solo los de esa proforma. */
export async function listProformaEvents(proformaId?: string, range?: DateRange): Promise<ProformaEvent[]> {
  const where: Condition[] = [{ column: 'entity', op: 'eq', value: 'proforma' }];
  if (proformaId) where.push({ column: 'entity_id', op: 'eq', value: proformaId });
  const { from, to } = range ? rangeToIso(range) : { from: null, to: null };
  if (from) where.push({ column: 'created_at', op: 'gte', value: from });
  if (to) where.push({ column: 'created_at', op: 'lte', value: to });
  return (await db().find('auditLog', {
    where,
    orderBy: [{ column: 'created_at', direction: 'desc' }],
    limit: EVENTS_LIMIT,
  })) as ProformaEvent[];
}
