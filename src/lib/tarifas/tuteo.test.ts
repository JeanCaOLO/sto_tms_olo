// La interfaz de Tarifas habla de "tú" (revisa, elige, puedes), como el resto del sistema multi-país: el voseo
// ("revisá", "elegí", "podés") solo suena natural en un país. Este test recorre el código de Tarifas y falla si vuelve a
// aparecer. Si falla, cambia la forma del verbo a tuteo (revisa, elige, puedes…).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const CARPETAS = ['pages', 'lib', 'components', 'i18n'];

const VOSEO = new RegExp(
  '\\b(' +
    [
      'revis[á]', 'eleg[í]s?', 'escrib[í]', 'dej[á]', 'pod[é]s', 'ten[é]s', 'quer[é]s', 'us[á]', 'prob[á]', 'cre[á]',
      'agreg[á]', 'complet[á]', 'fij[á]', 'toc[á]', 'corr[é]', 'mir[á]', 'volv[é]', 'habilit[á]', 'cambi[á]',
      'pon[é]', 'editala', 'ingres[á]', 'seleccion[á]', 'hac[é]', 'busc[á]', 'verific[á]', 'asegur[á]te',
      'indic[á]', 'reintent[á]', 'correg[í]', 'registr[á]', 'marc[á]', 'llam[á]', 'emit[í]', 'descarg[á]', 'ajust[á]', 'acot[á]',
      'sub[í]', 'cargalos', 'compar[á]', 'gener[á]', 'consult[á]', 'administr[á]s', 'us[á]s', 'pod[é]s',
    ].join('|') +
    ')(?![a-záéíóúñ])',
  'giu',
);

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__snapshots__' ? [] : archivos(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts') ? [full] : [];
  });
}

describe('Tarifas habla de tú, no de vos', () => {
  const hallazgos = CARPETAS.flatMap((c) => archivos(resolve(SRC, c))).flatMap((file) =>
    readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .flatMap((line, i) => [...line.matchAll(VOSEO)].map((m) => `${relative(SRC, file)}:${i + 1} "${m[0]}"`)),
  );

  it('no hay formas de voseo en el texto de la interfaz ni en los mensajes', () => {
    expect(hallazgos).toEqual([]);
  });
});
