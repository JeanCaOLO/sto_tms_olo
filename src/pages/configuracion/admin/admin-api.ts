// Cliente de la API de administración (backend/admin, /api/v1/admin/*).
// Crear/editar/borrar usuarios y roles pasa SIEMPRE por aquí: el backend lo
// hace en una transacción y exige rol administrador. La API genérica
// /api/data ya no permite escribir app_users, roles ni user_scopes.
import { apiFetch } from '../../../lib/supabase';

export type UserStatus = 'active' | 'inactive';

export interface ScopeInput {
  country_id?: string | null;
  warehouse_id?: string | null;
  customer_id?: string | null;
}

export interface UserScope extends ScopeInput {
  id: string;
  country_name?: string | null;
  warehouse_name?: string | null;
  customer_name?: string | null;
}

export interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  role_id: string | null;
  role_name: string | null;
  status: UserStatus;
  created_at: string;
  scopes: UserScope[];
}

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  user_count: number;
}

export interface UserPayload {
  full_name: string;
  role_id: string;
  status: UserStatus;
  scopes: ScopeInput[];
  email?: string;
  password?: string;
}

export interface RolePayload {
  name: string;
  description: string;
}

export interface Option {
  id: string;
  name: string;
}

const ADMIN = '/v1/admin';

type FetchInit = NonNullable<Parameters<typeof apiFetch>[1]>;

function errorMessage(status: number, body: any): string {
  return body?.error?.message ?? body?.message ?? `Error ${status}`;
}

async function call<T>(path: string, init: FetchInit = {}): Promise<T> {
  const { ok, status, body } = await apiFetch(path, init);
  if (!ok) throw new Error(errorMessage(status, body));
  return body?.data as T;
}

const send = (method: string, payload?: unknown): FetchInit => ({
  method,
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

export const listUsers = () => call<AdminUser[]>(`${ADMIN}/users`);
export const createUser = (payload: UserPayload) => call<AdminUser>(`${ADMIN}/users`, send('POST', payload));
export const updateUser = (id: string, payload: Partial<UserPayload>) =>
  call<AdminUser>(`${ADMIN}/users/${id}`, send('PATCH', payload));
export const deleteUser = (id: string) => call<{ id: string }>(`${ADMIN}/users/${id}`, send('DELETE'));
export const resetPassword = (id: string, password: string) =>
  call<{ id: string }>(`${ADMIN}/users/${id}/password`, send('POST', { password }));

export const listRoles = () => call<AdminRole[]>(`${ADMIN}/roles`);
export const createRole = (payload: RolePayload) => call<AdminRole>(`${ADMIN}/roles`, send('POST', payload));
export const updateRole = (id: string, payload: RolePayload) =>
  call<AdminRole>(`${ADMIN}/roles/${id}`, send('PATCH', payload));
export const deleteRole = (id: string) => call<{ id: string }>(`${ADMIN}/roles/${id}`, send('DELETE'));

// Jerarquía para elegir alcances (backend/context; un admin GLOBAL ve todo).
export const listCountries = () => call<Option[]>('/v1/countries');
export const listWarehouses = (countryId: string) => call<Option[]>(`/v1/countries/${countryId}/warehouses`);
export const listCustomers = (warehouseId: string) => call<Option[]>(`/v1/warehouses/${warehouseId}/customers`);

export const isGlobalScope = (scope: ScopeInput) => !scope.country_id && !scope.warehouse_id && !scope.customer_id;

export function describeScope(scope: UserScope): string {
  if (isGlobalScope(scope)) return 'Global';
  return [scope.country_name, scope.warehouse_name, scope.customer_name].filter(Boolean).join(' › ');
}
