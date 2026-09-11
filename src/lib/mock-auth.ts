import type { Session, User } from '@supabase/supabase-js';

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

// ponytail: opt-in via VITE_MOCK_AUTH so it never affects teammates who don't
// set it in their own .env.local. Bypasses Supabase auth entirely for local
// prototyping when there's no working login for this environment yet.
export const MOCK_AUTH_ENABLED = import.meta.env.VITE_MOCK_AUTH === 'true';

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
