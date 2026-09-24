import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { permKeyForPath } from './module-routes';
import { postAuditEvent } from '../../pages/auditoria/audit-api';
import NoAccess from '../../pages/NoAccess';

// Frena el acceso por URL a un módulo sin `view`. Rutas no listadas en el menú
// (login, seed, home, detalles) no tienen permKey y pasan sin restricción.
export default function RouteGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { can, loading } = usePermissions();
  const permKey = permKeyForPath(location.pathname);
  const allowed = !loading && permKey ? can(permKey, 'view') : false;

  // Registra la navegación (view) una vez por módulo visitado, fire-and-forget.
  // Solo cuando el acceso está permitido (no tiene sentido auditar un 403 de UI).
  useEffect(() => {
    if (permKey && allowed) postAuditEvent('view', permKey);
  }, [permKey, allowed]);

  if (loading || !permKey) return <>{children}</>;
  if (!can(permKey, 'view')) return <NoAccess />;
  return <>{children}</>;
}
