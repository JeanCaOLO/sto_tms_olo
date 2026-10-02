// Cliente de la bitácora de auditoría (backend/admin). Lectura por cursor +
// registro de eventos del navegador. El registro es fire-and-forget: nunca
// bloquea ni rompe la UI si falla.
import { apiFetch } from '../../lib/supabase';

export type AuditAction =
  | 'create' | 'update' | 'delete'
  | 'login' | 'login_failed' | 'login_blocked' | 'logout'
  | 'view' | 'export' | 'print' | 'download';

export type ActorType = 'user' | 'system' | 'anonymous';

export interface AuditRow {
  id: string;
  occurred_at: string;
  actor_type: ActorType;
  app_user_id: string | null;
  actor_email: string | null;
  role_name: string | null;
  source: string | null;
  action: AuditAction;
  module_key: string | null;
  entity_table: string | null;
  entity_id: string | null;
  changes: Record<string, [unknown, unknown]> | null;
  request_id: string | null;
  ip: string | null;
}

export interface AuditDetail extends AuditRow {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditFilters {
  from?: string;
  to?: string;
  actor_type?: ActorType;
  email?: string;
  action?: AuditAction;
  module?: string;
  table?: string;
  entity_id?: string;
  limit?: number;
  before_id?: string;
}

interface AuditPage {
  data: AuditRow[];
  next_cursor: string | null;
}

export async function getAuditEvents(filters: AuditFilters): Promise<AuditPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  }
  const { ok, body } = await apiFetch(`/v1/admin/audit?${params.toString()}`);
  if (!ok) throw new Error(body?.error?.message ?? 'No se pudo cargar la bitácora');
  return { data: body.data ?? [], next_cursor: body.next_cursor ?? null };
}

export async function getAuditEvent(id: string): Promise<AuditDetail> {
  const { ok, body } = await apiFetch(`/v1/admin/audit/${id}`);
  if (!ok) throw new Error(body?.error?.message ?? 'No se pudo cargar el detalle');
  return body.data as AuditDetail;
}

// Registro de un evento del navegador. Fire-and-forget: se traga cualquier error
// (incluye red caída) para no interferir con la acción del usuario.
export function postAuditEvent(action: AuditAction, moduleKey: string, metadata?: Record<string, unknown>): void {
  void apiFetch('/v1/audit/events', {
    method: 'POST',
    body: JSON.stringify({ action, module_key: moduleKey, metadata }),
  }).catch(() => undefined);
}
