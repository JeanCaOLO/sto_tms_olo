// Correo de una proforma: dirección del transportista (catálogo) y registro de que ya se envió.

import { db } from '../data';
import { proformaAuditRow } from './proformaAudit';

/** `carriers.email`, solo lectura. Nulo si el transportista no tiene correo cargado. */
export async function getCarrierEmail(carrierId: string): Promise<string | null> {
  const row = await db().findOne('carrier', carrierId);
  const email = typeof row?.email === 'string' ? row.email.trim() : '';
  return email || null;
}

/** Deja constancia de que la proforma se envió (con bitácora, en la misma transacción). */
export async function markEmailSent(proformaId: string, recipients: string[]): Promise<{ error: string | null }> {
  try {
    const now = new Date().toISOString();
    await db().transaction(async (tx) => {
      await tx.update('proforma', proformaId, { email_sent_at: now, updated_at: now });
      await tx.insert('auditLog', proformaAuditRow('UPDATE', proformaId, { emailSent: false }, { emailSent: true, to: recipients }));
    });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
