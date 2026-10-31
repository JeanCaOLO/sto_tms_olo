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
