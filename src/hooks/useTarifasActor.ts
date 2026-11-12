import { useEffect } from 'react';
import { usePermissions } from './usePermissions';
import { useAuth } from './useAuth';
import { setActorName, setActorRole } from '../lib/tarifas/actor';

// Publica el rol y el nombre reales del usuario para que la bitácora del tarifador los registre.
export function useTarifasActor(): void {
  const { permissions } = usePermissions();
  const { appUser } = useAuth();
  const userName = appUser?.full_name || appUser?.email || null;
  const roleName = permissions?.role?.name ?? (permissions?.is_admin ? 'Administrador' : null);
  useEffect(() => {
    setActorRole(roleName);
  }, [roleName]);
  useEffect(() => {
    setActorName(userName);
  }, [userName]);
}
