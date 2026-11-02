// Cada variable VITE_* que lee el código tiene que estar documentada en `.env.example`: es lo único que dice qué definir en
// el build de un ambiente. Antes solo figuraban VITE_MOCK_AUTH y VITE_API_BASE, y las demás (mapas, OSRM, WebSocket, API
// del tarifador) se descubrían leyendo el código. Si este test falla, agrega la variable a `.env.example`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ENV_EXAMPLE = readFileSync(resolve(SRC, '..', '.env.example'), 'utf-8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts') ? [full] : [];
  });
}

const usadas = new Set<string>();
for (const file of sourceFiles(SRC)) {
  for (const match of readFileSync(file, 'utf-8').matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)|\benv\(\s*'(VITE_[A-Z0-9_]+)'/g)) {
    usadas.add(match[1] ?? match[2]);
  }
}

describe('.env.example documenta las variables VITE_ que usa el código', () => {
  it('el código lee al menos las variables conocidas (el escaneo funciona)', () => {
    expect([...usadas]).toEqual(expect.arrayContaining(['VITE_API_BASE', 'VITE_MOCK_AUTH', 'VITE_WS_URL']));
  });

  it.each([...usadas].sort())('%s figura en .env.example', (name) => {
    expect(ENV_EXAMPLE).toMatch(new RegExp(`^#?\\s*${name}=`, 'm'));
  });

  it('advierte de los valores por defecto que no sirven en producción', () => {
    expect(ENV_EXAMPLE).toMatch(/localhost:4100/);
    expect(ENV_EXAMPLE).toMatch(/router\.project-osrm\.org/);
    expect(ENV_EXAMPLE).toMatch(/tile\.openstreetmap\.org/);
  });
});
