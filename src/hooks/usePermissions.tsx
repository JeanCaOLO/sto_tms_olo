import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import { MOCK_AUTH_ENABLED, MOCK_ROLE_EVENT, getMockRole, mockPermissionsFor } from '../lib/mock-auth';
import { getMyPermissions, type MyPermissions, type PermAction } from '../pages/configuracion/admin/admin-api';

interface PermissionsContextType {
  loading: boolean;
  isAdmin: boolean;
  // can(modulo, accion): un admin puede todo. El backend no exige `view` para
  // leer, pero el front oculta módulos/acciones sin permiso.
  can: (modulo: string, accion: PermAction) => boolean;
  // Vista de demostración: quien puede configurar el tarifador (admin / desarrollador) puede ver el
  // sistema como lo vería un Liquidador. Solo cambia lo que se muestra; el backend sigue usando los
  // permisos reales del usuario.
  canPreview: boolean;
  viewAs: ViewAs;
  setViewAs: (view: ViewAs) => void;
  countries: { all: boolean; ids: string[] };
  permissions: MyPermissions | null;
  // Falló la carga de permisos: fail-closed (menú vacío) PERO con aviso + reintento,
  // en vez de un menú vacío mudo.
  error: boolean;
  reload: () => void;
}

export type ViewAs = 'desarrollador' | 'liquidador';

// Lo que ve y puede hacer el rol Liquidador: liquidar, y solo LEER la configuración del tarifador.
const LIQUIDADOR_VIEW: Record<string, PermAction[]> = {
  tarifas: ['view', 'create', 'edit', 'export'],
  'tarifas.config': ['view', 'export'],
};
const PREVIEW_KEY = 'tarifador.viewAs';

function readViewAs(): ViewAs {
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === 'liquidador' ? 'liquidador' : 'desarrollador';
  } catch {
    return 'desarrollador';
  }
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [permissions, setPermissions] = useState<MyPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const [requestedView, setRequestedView] = useState<ViewAs>(readViewAs);

  useEffect(() => {
    if (MOCK_AUTH_ENABLED) {
      // Rol de pruebas del mock (selector de la esquina); por defecto, administrador.
      const apply = () => setPermissions(mockPermissionsFor(getMockRole()) as MyPermissions);
      apply();
      setLoading(false);
      window.addEventListener(MOCK_ROLE_EVENT, apply);
      return () => window.removeEventListener(MOCK_ROLE_EVENT, apply);
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

  const realCan = (modulo: string, accion: PermAction): boolean => {
    if (isAdmin) return true;
    return permissions?.modules[modulo]?.includes(accion) ?? false;
  };
  const canPreview = realCan('tarifas.config', 'edit');
  const viewAs: ViewAs = canPreview ? requestedView : 'desarrollador';
  const setViewAs = (view: ViewAs) => {
    setRequestedView(view);
    try { sessionStorage.setItem(PREVIEW_KEY, view); } catch { /* sin almacenamiento: vale solo en esta pestaña */ }
  };

  const can = (modulo: string, accion: PermAction): boolean => {
    if (viewAs === 'liquidador') return LIQUIDADOR_VIEW[modulo]?.includes(accion) ?? false;
    return realCan(modulo, accion);
  };

  const countries = permissions?.countries ?? { all: false, ids: [] };

  return (
    <PermissionsContext.Provider value={{ loading, isAdmin, can, canPreview, viewAs, setViewAs, countries, permissions, error, reload }}>
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
