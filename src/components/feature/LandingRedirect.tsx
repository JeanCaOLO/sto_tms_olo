import { Navigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { DEFAULT_LANDING, landingPath } from '../../lib/landing';

// "/" entra al primer módulo que la persona puede ver (Dashboard si lo tiene). Mientras se cargan los permisos
// espera; si fallaron, va a /dashboard, donde RouteGuard muestra el aviso con reintento.
export default function LandingRedirect() {
  const { can, loading, error } = usePermissions();
  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
      </div>
    );
  }
  return <Navigate to={error ? DEFAULT_LANDING : landingPath((permKey) => can(permKey, 'view'))} replace />;
}
