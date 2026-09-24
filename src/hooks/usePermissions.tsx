import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import { MOCK_AUTH_ENABLED } from '../lib/mock-auth';
import { getMyPermissions, type MyPermissions, type PermAction } from '../pages/configuracion/admin/admin-api';

interface PermissionsContextType {
  loading: boolean;
  isAdmin: boolean;
  // can(modulo, accion): un admin puede todo. El backend no exige `view` para
  // leer, pero el front oculta módulos/acciones sin permiso.
  can: (modulo: string, accion: PermAction) => boolean;
  countries: { all: boolean; ids: string[] };
  permissions: MyPermissions | null;
  // Falló la carga de permisos: fail-closed (menú vacío) PERO con aviso + reintento,
  // en vez de un menú vacío mudo.
  error: boolean;
  reload: () => void;
}

const ADMIN_ALL: MyPermissions = {
  role: null,
  is_admin: true,
  modules: {},
  countries: { all: true, ids: [] },
};

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [permissions, setPermissions] = useState<MyPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (MOCK_AUTH_ENABLED) {
      setPermissions(ADMIN_ALL);
      setLoading(false);
      return;
    }
    if (!session) {
      setPermissions(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    getMyPermissions()
      .then((data) => { if (!cancelled) setPermissions(data); })
      .catch(() => { if (!cancelled) { setPermissions(null); setError(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, reloadKey]);

  const isAdmin = permissions?.is_admin ?? false;

  const can = (modulo: string, accion: PermAction): boolean => {
    if (isAdmin) return true;
    return permissions?.modules[modulo]?.includes(accion) ?? false;
  };

  const countries = permissions?.countries ?? { all: false, ids: [] };

  return (
    <PermissionsContext.Provider value={{ loading, isAdmin, can, countries, permissions, error, reload }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextType {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions debe usarse dentro de PermissionsProvider');
  }
  return context;
}
