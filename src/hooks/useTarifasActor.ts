import { useEffect } from 'react';
import { usePermissions } from './usePermissions';
import { setActorRole } from '../lib/tarifas/actor';

// Publica el rol real del usuario para que la bitácora del tarifador lo registre.
export function useTarifasActor(): void {
  const { permissions } = usePermissions();
  const roleName = permissions?.role?.name ?? (permissions?.is_admin ? 'Administrador' : null);
  useEffect(() => {
    setActorRole(roleName);
  }, [roleName]);
}
