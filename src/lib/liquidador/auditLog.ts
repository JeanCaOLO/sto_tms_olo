// Bitácora de auditoría append-only (RF-012 / RNF-023 / RNF-024) — persistida en la tabla real
// `audit_log` del proyecto de Supabase temporal del Liquidador (`supabaseLiquidador`). Este módulo
// SOLO expone `registrarEvento` (INSERT) y `listarEventos` (SELECT) — nunca UPDATE ni DELETE. La
// política RLS de `audit_log` en la base tampoco permite update/delete desde el cliente, así que la
// inmutabilidad no depende solo de que nadie llame a una función que no existe acá.

import { supabaseLiquidador } from '../tarifas/supabaseLiquidador';
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
  const { error } = await supabaseLiquidador.from('audit_log').insert([{
    entity: evento.entidad,
    entity_id: evento.entidadId,
    action: evento.accion,
    user_name: evento.usuario,
    role: evento.rol,
    before: evento.antes ?? null,
    after: evento.despues ?? null,
    reason: evento.motivo ?? null,
  }]);
  if (error) {
    // La bitácora no debe tumbar la acción de negocio que la disparó — se deja constancia en
    // consola y se sigue. En el backend definitivo esto se resuelve con una transacción real.
    console.error('No se pudo registrar el evento en la bitácora de auditoría:', error);
  }
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
  const { data, error } = await supabaseLiquidador
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}
