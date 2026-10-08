// Reglas de tarifa de liquidación.

import { db, type Row } from '../data';

type SaveResult = { error: { code?: string; message: string } | null };

const OK: SaveResult = { error: null };

export async function listRules(_organizationId: string): Promise<Row[]> {
  return db().find('pricingRule', {
    orderBy: [{ column: 'stage', locale: true }, { column: 'priority' }],
  });
}

export async function saveRule(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  try {
    if (id) {
      await db().update('pricingRule', id, payload);
    } else {
      await db().insert('pricingRule', payload);
    }
    return OK;
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export async function deleteRule(id: string): Promise<SaveResult> {
  try {
    await db().delete('pricingRule', id);
    return OK;
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
