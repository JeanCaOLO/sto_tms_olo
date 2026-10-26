import { useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { usePermissions } from '../../../hooks/usePermissions';
import type { PhaseActor } from '../../../lib/tarifas/proformas';

/** Quién está logueado, en la forma que usan las reglas del flujo. Nulo mientras cargan sesión y permisos. */
export function useProformaActor(): PhaseActor | null {
  const { appUser } = useAuth();
  const { permissions } = usePermissions();
  const roleName = permissions?.role?.name ?? (permissions?.is_admin ? 'Administrador' : null);
  return useMemo(() => {
    if (!appUser || !roleName) return null;
    return { userId: appUser.id, userName: appUser.full_name || appUser.email, roleName };
  }, [appUser, roleName]);
}
