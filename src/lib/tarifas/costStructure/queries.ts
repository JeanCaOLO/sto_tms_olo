// Consultas de lectura para estructuras de costos.

import { db } from '../data';
import type { CostStructure, CostStructureRow } from '../types';
import { toCostStructure, toCostStructureRow } from './schema';

/** Estructuras de una compañía o, con `partyId` nulo, las por defecto de un país. */
export async function listStructures(partyId: string | null, countryId?: string): Promise<CostStructure[]> {
  const rows = await db().find('costStructure', {
    where: [
      { column: 'party_id', op: 'eq', value: partyId },
      ...(partyId === null && countryId ? [{ column: 'country_id', op: 'eq' as const, value: countryId }] : []),
    ],
    orderBy: [{ column: 'name', locale: true }],
  });
  return rows.map(toCostStructure);
}

/** La estructura vigente de una compañía: la activa. Es la que usa el motor al liquidar. */
export async function activeStructure(partyId: string | null, countryId?: string): Promise<CostStructure | null> {
  const rows = await db().find('costStructure', {
    where: [
      { column: 'party_id', op: 'eq', value: partyId },
      ...(partyId === null && countryId ? [{ column: 'country_id', op: 'eq' as const, value: countryId }] : []),
      { column: 'active', op: 'eq', value: true },
    ],
    limit: 1,
  });
  return rows[0] ? toCostStructure(rows[0]) : null;
}

export async function listRows(structureId: string): Promise<CostStructureRow[]> {
  const rows = await db().find('costStructureRow', {
    where: [{ column: 'structure_id', op: 'eq', value: structureId }],
    orderBy: [{ column: 'row_order' }],
  });
  return rows.map(toCostStructureRow);
}
