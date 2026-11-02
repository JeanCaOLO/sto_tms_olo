// El sistema de diseño (`components/base`) y casi todas las pantallas usan la paleta `slate`. Mezclar `gray-*` en una misma
// pantalla deja grises ligeramente distintos lado a lado. Tarifas y Tracking usan solo `slate`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CARPETAS = ['pages/reglas-tarifa', 'pages/liquidaciones', 'pages/proformas', 'pages/tracking', 'components/base', 'components/tarifas'];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__snapshots__' ? [] : archivos(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe('paleta de grises', () => {
  it('Tarifas, Tracking y el sistema de diseño no usan gray-* (solo slate-*)', () => {
    const hallazgos = CARPETAS.flatMap((c) => archivos(resolve(SRC, c))).flatMap((file) =>
      readFileSync(file, 'utf-8')
        .split(/\r?\n/)
        .flatMap((line, i) => (/\b[a-z:-]*gray-\d{2,3}\b/.test(line) ? [`${relative(SRC, file)}:${i + 1}`] : [])),
    );
    expect(hallazgos).toEqual([]);
  });
});
