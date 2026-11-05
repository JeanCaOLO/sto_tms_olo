// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';

function mockLogin(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('signInWithPassword con credenciales inválidas', () => {
  it('muestra el mensaje en español, no el código', async () => {
    mockLogin(401, { error: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' });
    const { error } = await apiClient.auth.signInWithPassword({ email: 'a@b.c', password: 'mala' });
    expect(error?.message).toBe('Correo o contraseña incorrectos.');
  });

  it('sin message cae al código del error', async () => {
    mockLogin(401, { error: 'invalid_credentials' });
    const { error } = await apiClient.auth.signInWithPassword({ email: 'a@b.c', password: 'mala' });
    expect(error?.message).toBe('invalid_credentials');
  });
});
