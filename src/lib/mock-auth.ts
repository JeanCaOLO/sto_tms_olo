import type { AuthSession as Session, AuthUser as User } from './supabase';

export interface Role {
  id: string;
  name: string;
}

export interface AppUser {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
  role_id: string;
  organization_id: string;
  role: Role;
}

// NOTE: opt-in via VITE_MOCK_AUTH so it never affects teammates who don't set it
// in their own .env.local. Es una RED DE SEGURIDAD para probar en local/PR sin
// backend: el login real sigue siendo la puerta principal (ver useAuth.signIn),
// y el mock solo entra si el login real falla o es inalcanzable.
//
// Guard de SEGURIDAD: además de la env var, exigimos `import.meta.env.DEV` para
// que este bypass NUNCA quede activo en un build desplegado (Amplify/sandbox/prod),
// aunque alguien deje VITE_MOCK_AUTH=true por error. `vite build` pone DEV=false.
export const MOCK_AUTH_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === 'true';

const MOCK_ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const MOCK_ROLE_ID = 'mock-role-superusuario';

export const mockAppUser: AppUser = {
  id: 'mock-app-user',
  auth_user_id: 'mock-auth-user',
  full_name: 'Jesús Araujo (mock)',
  email: 'jaraujo@intelix.biz',
  role_id: MOCK_ROLE_ID,
  organization_id: MOCK_ORGANIZATION_ID,
  role: { id: MOCK_ROLE_ID, name: 'SuperUsuario' },
};

export const mockUser = { id: mockAppUser.auth_user_id, email: mockAppUser.email } as User;

export const mockSession = {
  user: mockUser,
  access_token: 'mock-access-token',
  token_type: 'bearer',
} as unknown as Session;
