// Plantillas de viaje frecuente.

import { db, type Row } from '../data';

type SaveResult = { error: { code?: string; message: string } | null };

const OK: SaveResult = { error: null };

export async function listTemplates(_organizationId: string): Promise<Row[]> {
  return db().find('pricingTemplate');
}

export async function saveTemplate(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  try {
    if (id) {
      await db().update('pricingTemplate', id, payload);
    } else {
      await db().insert('pricingTemplate', payload);
    }
    return OK;
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export async function deleteTemplate(id: string): Promise<SaveResult> {
  try {
    await db().delete('pricingTemplate', id);
    return OK;
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
