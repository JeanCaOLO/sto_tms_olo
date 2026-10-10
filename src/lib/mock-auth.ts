import type { AuthSession as Session, AuthUser as User } from './supabase';
import type { MockRole } from './tarifas/data/memory/fakeBackend';
import { MOCK_COUNTRY_IDS } from './tarifas/data/memory/mockIds';

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

// ── Contexto operativo mock ──────────────────────────────────────────────────────────────────
// Sin backend, `/v1/me/context` y `/v1/countries…` no responden y el selector País → Almacén →
// Cliente del header queda vacío: el tarifador (y todo lo que filtra por país) se ve distinto al
// modo normal. Estas respuestas reemplazan SOLO esas llamadas, con la misma forma que el backend.
// Los ids de país coinciden con los de la semilla del tarifador (`data/memory/seed.demo.json`).
const MOCK_COUNTRIES = [
  { id: MOCK_COUNTRY_IDS.CR, code: 'CR', name: 'Costa Rica', timezone: 'America/Costa_Rica' },
  { id: MOCK_COUNTRY_IDS.VE, code: 'VE', name: 'Venezuela', timezone: 'America/Caracas' },
  { id: MOCK_COUNTRY_IDS.CO, code: 'CO', name: 'Colombia', timezone: 'America/Bogota' },
];

const MOCK_WAREHOUSES = [
  { id: 'WH_CR_HER', country_id: MOCK_COUNTRY_IDS.CR, code: 'HER', name: 'CEDI Heredia' },
  { id: 'WH_CR_ALA', country_id: MOCK_COUNTRY_IDS.CR, code: 'ALA', name: 'CEDI La Ribera, Alajuela' },
  { id: 'WH_VE_VAL', country_id: MOCK_COUNTRY_IDS.VE, code: 'VAL', name: 'CEDI Valencia' },
  { id: 'WH_CO_BOG', country_id: MOCK_COUNTRY_IDS.CO, code: 'BOG', name: 'CEDI Bogotá' },
];

const MOCK_CUSTOMERS = [
  { id: 'CUST_COFERSA', warehouse_id: 'WH_CR_HER', code: 'COFERSA', name: 'Cofersa' },
  { id: 'CUST_EPA', warehouse_id: 'WH_CR_HER', code: 'EPA', name: 'EPA' },
  { id: 'CUST_COFERSA_ALA', warehouse_id: 'WH_CR_ALA', code: 'COFERSA', name: 'Cofersa' },
  { id: 'CUST_BEVAL', warehouse_id: 'WH_VE_VAL', code: 'BEVAL', name: 'Beval' },
  { id: 'CUST_FEBECA', warehouse_id: 'WH_VE_VAL', code: 'FEBECA', name: 'Febeca' },
  { id: 'CUST_CO_1', warehouse_id: 'WH_CO_BOG', code: 'ALMACENES', name: 'Almacenes Éxito' },
];

type MockApiResult = { ok: boolean; status: number; body: any };

/** Respuesta mock de los endpoints de contexto operativo; `null` si la ruta no es de contexto. */
export function mockContextResponse(path: string): MockApiResult | null {
  const ok = (data: unknown): MockApiResult => ({ ok: true, status: 200, body: { data } });
  if (path === '/v1/me/context') {
    // Un scope sin país/almacén/cliente = acceso global (superusuario).
    return ok({ scopes: [{ id: 'mock-scope', roleId: MOCK_ROLE_ID, countryId: null, warehouseId: null, customerId: null }] });
  }
  if (path === '/v1/countries') return ok(MOCK_COUNTRIES);
  const wh = /^\/v1\/countries\/([^/]+)\/warehouses$/.exec(path);
  if (wh) return ok(MOCK_WAREHOUSES.filter((w) => w.country_id === wh[1]));
  const cu = /^\/v1\/warehouses\/([^/]+)\/customers$/.exec(path);
  if (cu) return ok(MOCK_CUSTOMERS.filter((c) => c.warehouse_id === cu[1]));
  return null;
}

// ── Rol de pruebas del mock ──────────────────────────────────────────────────────────────────
// El mock siempre entraba como administrador, así que los botones deshabilitados por rol y los 403 del
// backend nunca se veían. `MockRoleSwitch` (solo en modo mock) cambia el rol; el backend simulado
// (`tarifas/data/memory/fakeBackend.ts`) y `usePermissions` leen el mismo valor.
export type { MockRole } from './tarifas/data/memory/fakeBackend';

const MOCK_ROLE_KEY = 'tarifas-mock:role';
export const MOCK_ROLE_EVENT = 'tarifas-mock-role';
export const MOCK_ROLES: { value: MockRole; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'liquidar', label: 'Solo liquidar' },
  { value: 'configurar', label: 'Solo configurar' },
];

export function getMockRole(): MockRole {
  try {
    const stored = localStorage.getItem(MOCK_ROLE_KEY);
    return MOCK_ROLES.some((r) => r.value === stored) ? (stored as MockRole) : 'admin';
  } catch {
    return 'admin';
  }
}

export function setMockRole(role: MockRole): void {
  try {
    localStorage.setItem(MOCK_ROLE_KEY, role);
  } catch {
    // Sin almacenamiento: el cambio vale solo hasta recargar.
  }
  window.dispatchEvent(new Event(MOCK_ROLE_EVENT));
}

/** Permisos que devuelve `/me/permissions` para cada rol de prueba (mismos módulos que usa el tarifador). */
export function mockPermissionsFor(role: MockRole) {
  const all = { role: null, is_admin: true, modules: {}, countries: { all: true, ids: [] } } as const;
  if (role === 'admin') return all;
  const modules: Record<string, string[]> = role === 'liquidar'
    ? { tarifas: ['view', 'create', 'edit', 'export'], 'tarifas.config': ['view', 'export'] }
    : { tarifas: ['view', 'export'], 'tarifas.config': ['view', 'create', 'edit', 'delete', 'export'] };
  return {
    role: { id: `mock-role-${role}`, name: MOCK_ROLES.find((r) => r.value === role)?.label ?? role },
    is_admin: false,
    modules,
    countries: { all: true, ids: [] },
  };
}

// ── Sesión del TMS para la bitácora ──────────────────────────────────────────────────────────
// La bitácora toma el autor de `localStorage.tms_session`. El login mock no lo escribía y quedaba
// «usuario sin sesión». Se guarda sin token y se borra al cerrar o recargar la página, para no dejar
// una sesión a medias que `AuthProvider` intentaría restaurar contra un backend que no existe.
export function rememberMockActor(): void {
  try {
    localStorage.setItem('tms_session', JSON.stringify({ user: { email: mockAppUser.email } }));
    window.addEventListener('pagehide', () => {
      try { localStorage.removeItem('tms_session'); } catch { /* nada que limpiar */ }
    }, { once: true });
  } catch {
    // Sin almacenamiento: la bitácora mostrará «usuario sin sesión».
  }
}
