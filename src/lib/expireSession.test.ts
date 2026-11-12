// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, STORAGE_KEY, apiClient } from './api-client';
import { fetchExpiringSession } from './tarifas/data';

const session = (token: string) => ({ access_token: token, token_type: 'bearer', user: { id: 'u1', email: 'a@b.c' } });

function mockFetch(status: number, body: unknown = { error: 'invalid_token' }) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

let events: Array<string>;
let unsubscribe: () => void;

beforeEach(() => {
  localStorage.clear();
  events = [];
  const { data } = apiClient.auth.onAuthStateChange((event) => events.push(event));
  unsubscribe = () => data.subscription.unsubscribe();
});

afterEach(() => {
  unsubscribe();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('apiFetch ante un 401', () => {
  it('borra la sesión y avisa SIGNED_OUT', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('viejo')));
    mockFetch(401);
    const res = await apiFetch('/v1/viajes');
    expect(res.status).toBe(401);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toEqual(['SIGNED_OUT']);
  });

  it('varios 401 simultáneos cierran la sesión una sola vez', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('viejo')));
    mockFetch(401);
    await Promise.all([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')]);
    expect(events).toEqual(['SIGNED_OUT']);
  });

  it('un 401 del login (credenciales incorrectas) no toca la sesión', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('otra')));
    mockFetch(401, { error: 'invalid_credentials' });
    await apiFetch('/auth/login', { method: 'POST', body: '{}' });
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(events).toEqual([]);
  });

  it('un 403 del authorizer de API Gateway (token vencido o alterado) cierra la sesión', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('vencido')));
    mockFetch(403, { message: 'Forbidden' });
    await apiFetch('/v1/viajes');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toEqual(['SIGNED_OUT']);
  });

  it('un 403 de permisos de una Lambda (con error) no cierra la sesión', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('ok')));
    mockFetch(403, { data: null, error: { message: 'Tu rol no tiene permiso para "view" en "tracking".' } });
    await apiFetch('/v1/viajes');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(events).toEqual([]);
  });

  it('un 403 no cierra la sesión', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('viejo')));
    mockFetch(403, { error: 'forbidden' });
    await apiFetch('/v1/viajes');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(events).toEqual([]);
  });

  it('un 401 sin sesión guardada no emite eventos', async () => {
    mockFetch(401);
    await apiFetch('/v1/viajes');
    expect(events).toEqual([]);
  });

  it('un 401 tardío del token viejo no borra una sesión nueva', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('viejo')));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // Mientras la llamada está en vuelo, el usuario inicia otra sesión.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session('nuevo')));
        return new Response('{}', { status: 401 });
      }),
    );
    await apiFetch('/v1/viajes');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).access_token).toBe('nuevo');
    expect(events).toEqual([]);
  });

  it('un 200 no cambia nada', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('ok')));
    mockFetch(200, { data: [] });
    await apiFetch('/v1/viajes');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(events).toEqual([]);
  });
});

describe('cliente HTTP del tarifador ante un 401', () => {
  it('cierra la sesión y devuelve la respuesta intacta', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('viejo')));
    mockFetch(401);
    const res = await fetchExpiringSession('/api/tarifas/x');
    expect(res.status).toBe(401);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(events).toEqual(['SIGNED_OUT']);
  });

  it('un 403 del authorizer también cierra la sesión', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('vencido')));
    mockFetch(403, { message: 'Forbidden' });
    const res = await fetchExpiringSession('/api/tarifas/x');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: 'Forbidden' }); // el cuerpo sigue legible para el driver
    expect(events).toEqual(['SIGNED_OUT']);
  });

  it('un 403 de permisos no cierra la sesión', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('ok')));
    mockFetch(403, { error: 'sin permiso' });
    await fetchExpiringSession('/api/tarifas/x');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(events).toEqual([]);
  });

  it('no toca la sesión con respuestas distintas de 401', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session('ok')));
    mockFetch(500, {});
    await fetchExpiringSession('/api/tarifas/x');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(events).toEqual([]);
  });
});
