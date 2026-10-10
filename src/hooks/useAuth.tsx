import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, type AuthSession as Session, type AuthUser as User } from '../lib/supabase';
import { MOCK_AUTH_ENABLED, mockAppUser, mockSession, mockUser, rememberMockActor, type AppUser } from '../lib/mock-auth';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Reintenta unas pocas veces antes de rendirse: un hiccup transitorio de red
  // (p. ej. el tunel a la base de datos cayendose un instante) no debe dejar
  // appUser en null para el resto de la sesion — 9 paginas condicionan su
  // propia carga a `appUser?.organization_id` y se quedan "cargando" para
  // siempre si esto nunca se resuelve (ver docs/reference/analisis-sistema-tms.md y el
  // reporte de paginas colgadas de esta sesion).
  const fetchAppUser = async (authUserId: string, attempt = 1): Promise<void> => {
    const { data, error } = await supabase
      .from('app_users')
      .select('*, role:roles(id, name)')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!error && data) {
      setAppUser(data as AppUser);
      return;
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      return fetchAppUser(authUserId, attempt + 1);
    }

    console.error('No se pudo cargar app_users tras 3 intentos:', error);
  };

  // Entra en modo mock (usuario de prototipo). Solo se invoca cuando el login
  // real NO está disponible Y `VITE_MOCK_AUTH=true`. No es la puerta principal:
  // es una red de seguridad para probar en local/PR sin backend.
  const enterMock = (): { error: null } => {
    rememberMockActor();
    setSession(mockSession);
    setUser(mockUser);
    setAppUser(mockAppUser);
    return { error: null };
  };

  useEffect(() => {
    // Siempre intentamos primero la sesión REAL. Si hay una guardada y válida,
    // se entra con esa (el login real manda). Si no hay, se muestra el login
    // normal — NO auto-logueamos como mock aquí, para no tapar el login real.
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          void fetchAppUser(s.user.id).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((e) => {
        // Backend inalcanzable al restaurar sesión: tratamos como "sin sesión"
        // y dejamos que el usuario inicie sesión (real o, si aplica, mock).
        console.error('Error al obtener sesión:', e);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void fetchAppUser(s.user.id);
      } else {
        setAppUser(null);
      }
    });

    return () => { subscription.unsubscribe(); };
    // Suscripción única al montar; `fetchAppUser` solo usa setters estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return { error: null }; // login real OK -> manda el real
      // El backend respondió con error (p. ej. credenciales inválidas).
      if (MOCK_AUTH_ENABLED) return enterMock();
      return { error: error.message || 'Error al iniciar sesión. Intenta nuevamente.' };
    } catch {
      // El backend es inalcanzable (ECONNREFUSED / red). Si el mock está
      // habilitado, dejamos entrar en modo prototipo; si no, informamos.
      if (MOCK_AUTH_ENABLED) return enterMock();
      return { error: 'No se pudo conectar con el servidor de autenticación.' };
    }
  };

  const signOut = async () => {
    // Sirve tanto para sesión real como para la mock: cerramos contra el
    // backend (si hay) y limpiamos el estado local de todas formas.
    await supabase.auth.signOut().catch(() => null);
    setSession(null);
    setUser(null);
    setAppUser(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, appUser, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
