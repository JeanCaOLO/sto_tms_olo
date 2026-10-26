// Quién gestiona las proformas en curso: ve "En proceso", "Reclamos" y "Completadas", y decide los reclamos
// (reiniciar la liquidación o apelar). Es el Liquidador o un administrador. Espejo de `can_manage` del backend
// (`proformas_flow.py`): el servidor decide, esto solo muestra u oculta secciones y botones.

import { isSuperAdmin } from './isSuperAdmin';

const MANAGER_ROLES = new Set(['liquidador']);

export function canManageProformas(roleName: string | null | undefined): boolean {
  return isSuperAdmin(roleName) || MANAGER_ROLES.has((roleName ?? '').trim().toLowerCase());
}
