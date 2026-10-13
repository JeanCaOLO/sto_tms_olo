// Cobertura de las descripciones al pasar el ratón: cada campo, columna, sección y botón con texto del
// tarifador debe tener su descripción en `lib/tarifas/hints`. Si agregas uno nuevo y falla aquí,
// escribe su descripción (una frase) en el archivo del tipo que corresponda.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildHints, hintKey } from '../../../components/base/hintKey';
import { TARIFADOR_HINTS } from '../hints';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const ROOTS = ['pages/liquidaciones', 'pages/reglas-tarifa', 'pages/companias', 'components/tarifas'];
const HINTS = buildHints(TARIFADOR_HINTS);

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === '__snapshots__') continue;
      yield* sources(path);
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) yield path;
  }
}

/** Textos estáticos que el usuario ve, por tipo de elemento. */
function collect() {
  const found = { campo: new Set<string>(), columna: new Set<string>(), seccion: new Set<string>(), boton: new Set<string>() };
  for (const root of ROOTS) {
    for (const file of sources(join(SRC, root))) {
      const code = readFileSync(file, 'utf-8');
      for (const m of code.matchAll(/\blabel=["']([^"'{}]+)["']/g)) found.campo.add(m[1]!);
      for (const m of code.matchAll(/header:\s*['"]([^'"]+)['"]/g)) found.columna.add(m[1]!);
      for (const m of code.matchAll(/<h[2-4][^>]*>([^<{]+)<\/h[2-4]>/g)) found.seccion.add(m[1]!.trim());
      for (const m of code.matchAll(/<(?:Button|button)\b[^>]*>([^<>{}]*?)<\/(?:Button|button)>/g)) {
        const text = m[1]!.trim();
        if (text) found.boton.add(text);
      }
    }
  }
  return found;
}

// Textos que no necesitan descripción: dependen de datos (nombres de compañía, números) o son un solo
// símbolo/palabra de relleno.
const EXENTOS = new Set(['#', '?', 'Ayuda', 'Cerrar sesión']);

describe('cobertura de descripciones del tarifador', () => {
  const found = collect();
  for (const tipo of ['campo', 'columna', 'seccion', 'boton'] as const) {
    it(`todo ${tipo} con texto tiene su descripción`, () => {
      const faltan = [...found[tipo]]
        .filter((t) => !EXENTOS.has(t) && hintKey(t) && !HINTS[hintKey(t)])
        .sort();
      expect(faltan).toEqual([]);
    });
  }

  it('cada descripción es corta (una frase, hasta 120 caracteres)', () => {
    const largas = Object.entries(TARIFADOR_HINTS).filter(([, d]) => d.length > 120).map(([k]) => k);
    expect(largas).toEqual([]);
  });
});
