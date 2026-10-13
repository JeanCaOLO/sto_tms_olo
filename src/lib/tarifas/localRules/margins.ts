// Política de margen — una fila por país.

import { db, type Row } from '../data';

type SaveResult = { error: { code?: string; message: string } | null };

const OK: SaveResult = { error: null };

export async function listMarginPolicies(_organizationId: string): Promise<Row[]> {
  return db().find('marginPolicy');
}

export async function saveMarginPolicy(_organizationId: string, payload: Row, id?: string): Promise<SaveResult> {
  try {
    if (id) {
      await db().update('marginPolicy', id, payload);
    } else {
      await db().insert('marginPolicy', payload);
    }
    return OK;
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
