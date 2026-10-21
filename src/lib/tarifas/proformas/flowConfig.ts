// Configuración del flujo de proformas por país: plantilla de fases y correo.

import { db } from '../data';
import { flowPhaseToRow, rowToFlowPhase } from './mapRows';
import { proformaConfigAuditRow } from './proformaAudit';
import type { ApproverType, FlowPhaseTemplate } from './types';

export type FlowPhaseDraft = Omit<FlowPhaseTemplate, 'id' | 'countryId' | 'position'>;

export interface EmailConfig {
  id: string | null;
  countryId: string;
  recipients: string[];
  includeCarrierEmail: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  mode: 'direct' | 'manual';
}

export const DEFAULT_SUBJECT = 'Proforma {number} – {carrier}';
export const DEFAULT_BODY = 'Estimados {carrier}:\n\nAdjuntamos la proforma {number} por un total de {total}. Por favor confirmen su recepción y conformidad.\n\nSaludos cordiales.';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function validateDrafts(drafts: FlowPhaseDraft[]): string | null {
  for (const [i, d] of drafts.entries()) {
    const label = `Fase ${i + 1}`;
    if (!d.name.trim()) return `${label}: escribe el nombre.`;
    const approver: ApproverType = d.approverType;
    if (approver === 'role' && !d.roleName?.trim()) return `${label}: elige el rol que aprueba.`;
    if (approver === 'user' && !d.userId?.trim()) return `${label}: elige el usuario que aprueba.`;
  }
  return null;
}

export async function listFlowPhases(countryId: string): Promise<FlowPhaseTemplate[]> {
  const rows = await db().find('proformaFlowPhase', {
    where: [{ column: 'country_id', op: 'eq', value: countryId }],
    orderBy: [{ column: 'position', direction: 'asc' }],
  });
  return rows.map(rowToFlowPhase);
}

/** Reemplaza la plantilla del país (todo o nada). Las proformas ya creadas conservan su copia de fases. */
export async function saveFlowPhases(countryId: string, drafts: FlowPhaseDraft[]): Promise<{ error: string | null }> {
  const invalid = validateDrafts(drafts);
  if (invalid) return { error: invalid };
  try {
    const current = await listFlowPhases(countryId);
    const names = (list: { name: string; approverLabel: string }[]) => list.map((p) => `${p.name} (${p.approverLabel})`);
    await db().transaction(async (tx) => {
      for (const old of current) await tx.delete('proformaFlowPhase', old.id);
      for (const [i, d] of drafts.entries()) {
        await tx.insert('proformaFlowPhase', flowPhaseToRow({ ...d, id: newId('prf'), countryId, position: i + 1 }));
      }
      await tx.insert('auditLog', proformaConfigAuditRow(countryId, { fases: names(current) }, { fases: names(drafts) }, 'Fases de aprobación'));
    });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getEmailConfig(countryId: string): Promise<EmailConfig> {
  const [row] = await db().find('proformaEmailConfig', { where: [{ column: 'country_id', op: 'eq', value: countryId }], limit: 1 });
  if (!row) {
    return { id: null, countryId, recipients: [], includeCarrierEmail: true, subjectTemplate: DEFAULT_SUBJECT, bodyTemplate: DEFAULT_BODY, mode: 'manual' };
  }
  return {
    id: String(row.id),
    countryId,
    recipients: Array.isArray(row.recipients) ? row.recipients.map(String) : [],
    includeCarrierEmail: row.include_carrier_email === true,
    subjectTemplate: String(row.subject_template),
    bodyTemplate: String(row.body_template),
    mode: row.mode === 'direct' ? 'direct' : 'manual',
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function invalidRecipients(recipients: string[]): string[] {
  return recipients.filter((r) => !EMAIL.test(r.trim()));
}

export async function saveEmailConfig(config: EmailConfig): Promise<{ error: string | null }> {
  const bad = invalidRecipients(config.recipients);
  if (bad.length > 0) return { error: `Correo no válido: ${bad.join(', ')}` };
  if (!config.subjectTemplate.trim() || !config.bodyTemplate.trim()) return { error: 'El asunto y el mensaje no pueden quedar vacíos.' };
  const values = {
    country_id: config.countryId,
    recipients: config.recipients.map((r) => r.trim()),
    include_carrier_email: config.includeCarrierEmail,
    subject_template: config.subjectTemplate,
    body_template: config.bodyTemplate,
    mode: config.mode,
  };
  try {
    await db().transaction(async (tx) => {
      if (config.id) await tx.update('proformaEmailConfig', config.id, values);
      else await tx.insert('proformaEmailConfig', { id: newId('pre'), ...values });
      await tx.insert('auditLog', proformaConfigAuditRow(
        config.countryId, null, { modo: values.mode, destinatarios: values.recipients, correoTransportista: values.include_carrier_email }, 'Correo de proformas',
      ));
    });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
