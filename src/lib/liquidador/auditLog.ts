// Bitácora de auditoría append-only (RF-012 / RNF-023 / RNF-024) — persistida en
// `localData/store.ts` (JSON + localStorage) mientras no hay acceso a una base de datos real para
// el módulo de tarifas. Este módulo SOLO expone `registrarEvento` (append) y `listarEventos`
// (lectura) — nunca update ni delete, ni acá ni en la UI que lo consume (BitacoraTab.tsx).

import { genId, loadDatabase, persist } from '../tarifas/localData/store';
import type { LiquidadorRole } from './rbac';

export interface EventoAuditoria {
  entidad: string;
  entidadId: string;
  accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'AUTHORIZE';
  usuario: string;
  rol: LiquidadorRole;
  antes?: unknown;
  despues?: unknown;
  motivo?: string;
}

export async function registrarEvento(evento: EventoAuditoria): Promise<void> {
  const db = loadDatabase();
  db.auditLog.push({
    id: genId('audit'),
    entity: evento.entidad,
    entity_id: evento.entidadId,
    action: evento.accion,
    user_name: evento.usuario,
    role: evento.rol,
    before: evento.antes ?? null,
    after: evento.despues ?? null,
    reason: evento.motivo ?? null,
    created_at: new Date().toISOString(),
  });
  persist(db);
}

export interface FilaAuditoria {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  user_name: string;
  role: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
}

export async function listarEventos(limite = 200): Promise<FilaAuditoria[]> {
  return loadDatabase()
    .auditLog
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limite) as FilaAuditoria[];
}
