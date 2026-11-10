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
  // `LandingRedirect` manda a /dashboard a quien lo ve y, si no (rol Devoluciones), a su primer módulo; en ambos casos
  // el destino pasa por RouteGuard (ver src/lib/landing.test.ts para la elección del destino).
  it('"/" entra por LandingRedirect, que solo redirige a rutas con permiso de módulo', async () => {
    const element = (await route('/'))?.element;
    expect(isValidElement(element)).toBe(true);
    // Se compara por nombre: tras resetModules el componente es otra instancia del módulo.
    expect((element as { type: { name: string } }).type.name).toBe('LandingRedirect');
  });

  it('las rutas antiguas redirigen conservando los parámetros', async () => {
    for (const path of ['/planificacion', '/tarifas/flota-propia', '/tarifas/transportistas']) {
      const element = (await route(path))?.element as { type: { name: string } } | undefined;
      expect(element?.type.name, path).toBe('RedirectKeepingQuery');
    }
  });
});

