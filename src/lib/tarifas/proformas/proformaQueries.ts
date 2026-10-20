// Lecturas de proformas: el listado del dashboard (con sus fases) y el detalle de una.

import { db } from '../data';
import { listSettlementSummariesByIds } from '../settlements/queryHelpers';
import type { SettlementRecord } from '../types';
import { rowToItem, rowToPhase, rowToProforma } from './mapRows';
import type { ProformaItem, ProformaPhase, ProformaRecord } from './types';

export interface ProformaWithPhases {
  proforma: ProformaRecord;
  phases: ProformaPhase[];
}

export interface ProformaDetail extends ProformaWithPhases {
  items: ProformaItem[];
  settlements: Map<string, SettlementRecord>;
}

/** Proformas del país, la más nueva primero, cada una con sus fases (para mostrar en qué fase va). */
export async function listProformas(countryId: string): Promise<ProformaWithPhases[]> {
  const rows = await db().find('proforma', {
    where: [{ column: 'country_id', op: 'eq', value: countryId }],
    orderBy: [{ column: 'created_at', direction: 'desc' }],
  });
  if (rows.length === 0) return [];
  const phaseRows = await db().find('proformaPhase', {
    where: [{ column: 'proforma_id', op: 'in', value: rows.map((r) => String(r.id)) }],
    orderBy: [{ column: 'position', direction: 'asc' }],
  });
  const phases = phaseRows.map(rowToPhase);
  return rows.map(rowToProforma).map((proforma) => ({
    proforma,
    phases: phases.filter((p) => p.proformaId === proforma.id),
  }));
}

export async function getProformaDetail(id: string): Promise<ProformaDetail | null> {
  const row = await db().findOne('proforma', id);
  if (!row) return null;
  const [phaseRows, itemRows] = await Promise.all([
    db().find('proformaPhase', { where: [{ column: 'proforma_id', op: 'eq', value: id }], orderBy: [{ column: 'position', direction: 'asc' }] }),
    db().find('proformaItem', { where: [{ column: 'proforma_id', op: 'eq', value: id }] }),
  ]);
  const items = itemRows.map(rowToItem);
  const proforma = rowToProforma(row);
  const settlements = new Map(
    (await listSettlementSummariesByIds(items.map((i) => i.settlementId))).map((s) => [s.id, s]),
  );
  return { proforma, phases: phaseRows.map(rowToPhase), items, settlements };
}

/** Ids de liquidaciones que ya están INCLUIDAS en alguna proforma: no se pueden agrupar de nuevo. */
export async function groupedSettlementIds(): Promise<Set<string>> {
  const rows = await db().find('proformaItem', {
    where: [{ column: 'state', op: 'neq', value: 'excluded' }],
    columns: ['settlement_id'],
  });
  return new Set(rows.map((r) => String(r.settlement_id)));
}
