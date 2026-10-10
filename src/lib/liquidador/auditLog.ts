// Bitácora de auditoría append-only (RF-012 / RNF-023 / RNF-024).
//
// Este módulo SOLO expone `registrarEvento` (append) y `listarEventos` (lectura) — nunca update ni
// delete, ni acá ni en la UI que lo consume (BitacoraTab.tsx). La restricción además está declarada
// en el registro de esquema (`appendOnly: true`), así que la capa de datos rechaza un update o un
// delete sobre esta entidad aunque alguien lo intente desde otro lado.

import { db } from '../tarifas/data';

export interface EventoAuditoria {
  entidad: string;
  entidadId: string;
  accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'AUTHORIZE';
  usuario: string;
  rol: string;
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

type AuditFailureListener = (error: unknown) => void;
const failureListeners = new Set<AuditFailureListener>();

/** Quien quiera avisar al usuario cuando la bitácora falle (hoy, `ToastProvider`). Devuelve cómo darse de baja. */
export function onAuditFailure(listener: AuditFailureListener): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

/**
 * Registra el evento SIN tumbar la operación que ya se guardó. Si la bitácora falla (por ejemplo un rol
 * que configura pero no tiene el módulo `tarifas`, que es el que escribe la bitácora), el cambio sigue
 * valiendo y se avisa en pantalla: antes el error solo iba a la consola o, peor, hacía parecer que el
 * cambio no se había guardado. Devuelve si quedó registrado.
 */
export async function registrarEventoSeguro(evento: EventoAuditoria): Promise<boolean> {
  try {
    await registrarEvento(evento);
    return true;
  } catch (error) {
    console.error('Error registrando evento de auditoría:', error);
    failureListeners.forEach((listener) => listener(error));
    return false;
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
  return (await db().find('auditLog', {
    orderBy: [{ column: 'created_at', direction: 'desc' }],
    limit: limite,
  })) as FilaAuditoria[];
}
