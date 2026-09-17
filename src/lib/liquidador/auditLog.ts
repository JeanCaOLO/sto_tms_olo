// Bitácora de auditoría append-only (RF-012 / RNF-023 / RNF-024).
//
// Este módulo SOLO expone `registrarEvento` (append) y `listarEventos` (lectura) — nunca update ni
// delete, ni acá ni en la UI que lo consume (BitacoraTab.tsx). La restricción además está declarada
// en el registro de esquema (`appendOnly: true`), así que la capa de datos rechaza un update o un
// delete sobre esta entidad aunque alguien lo intente desde otro lado.

import { db } from '../tarifas/data';
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
  await db().insert('auditLog', {
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
  return (await db().find('auditLog', {
    orderBy: [{ column: 'created_at', direction: 'desc' }],
    limit: limite,
  })) as FilaAuditoria[];
}
