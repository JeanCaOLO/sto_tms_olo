import { isValidElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPaths(): Promise<string[]> {
  vi.resetModules();
  const { default: routes } = await import('./config');
  return routes.map((r) => r.path ?? '');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('router config', () => {
  it('no expone /seed en producción', async () => {
    vi.stubEnv('DEV', false);
    const paths = await loadPaths();
    expect(paths).not.toContain('/seed');
    expect(paths).toContain('*');
  });

  it('expone /seed en desarrollo', async () => {
    vi.stubEnv('DEV', true);
    expect(await loadPaths()).toContain('/seed');
  });
});

describe('rutas de entrada y redirecciones', () => {
  const route = async (path: string) => {
    vi.resetModules();
    const { default: routes } = await import('./config');
    return routes.find((r) => r.path === path);
  };

  // `/` no tenía permiso propio: mostraba el Dashboard a quien `/dashboard` le habría dicho "Sin acceso".
  it('"/" redirige a /dashboard, que sí pasa por el permiso del módulo', async () => {
    const element = (await route('/'))?.element;
    expect(isValidElement(element)).toBe(true);
    // Se compara por nombre: tras resetModules `Navigate` es otra instancia del módulo.
    expect((element as { type: { name: string } }).type.name).toBe('Navigate');
    expect((element as { props: { to: string } }).props.to).toBe('/dashboard');
  });

  it('las rutas antiguas redirigen conservando los parámetros', async () => {
    for (const path of ['/planificacion', '/tarifas/flota-propia', '/tarifas/transportistas']) {
      const element = (await route(path))?.element as { type: { name: string } } | undefined;
      expect(element?.type.name, path).toBe('RedirectKeepingQuery');
    }
  });
});

