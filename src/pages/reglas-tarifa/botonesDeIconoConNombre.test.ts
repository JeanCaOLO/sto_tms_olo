// Los botones de Tarifas que solo traen un ícono llevan `title` (a veces dependiente del rol: "Tu rol no puede editar…").
// Un `title` no es un nombre estable para el lector de pantalla: cada uno necesita además su `aria-label` fijo.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

const ARCHIVOS = [
  'pages/reglas-tarifa/components/rate-table-modal/KeyColumnsEditor.tsx',
  'pages/reglas-tarifa/components/tarifarios/RateRowsCard.tsx',
  'pages/reglas-tarifa/components/tarifarios/RateRowsTable.tsx',
  'pages/reglas-tarifa/components/tarifarios/RateTableActions.tsx',
  'pages/reglas-tarifa/parts/RulesSection.tsx',
];

const BOTON = /<(?:button|Button)\b(?:=>|[^>])*>/g;

/** Botones cuyo contenido es solo etiquetas (el ícono): sin texto ni expresiones de texto. */
function botonesDeIcono(src: string): string[] {
  return [...src.matchAll(BOTON)]
    .filter((m) => {
      const resto = src.slice(m.index! + m[0].length);
      const cuerpo = resto.slice(0, resto.search(/<\/(?:button|Button)>/)).replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim();
      return cuerpo === '';
    })
    .map((m) => m[0]);
}

describe('botones de solo ícono con aria-label', () => {
  it.each(ARCHIVOS)('%s', (file) => {
    const botones = botonesDeIcono(readFileSync(resolve(SRC, file), 'utf-8'));
    expect(botones.length).toBeGreaterThan(0);
    const sinNombre = botones.filter((b) => !/aria-label=/.test(b));
    expect(sinNombre).toEqual([]);
  });

  it('el nombre no depende del rol: un aria-label dinámico no puede incluir "Tu rol"', () => {
    for (const file of ARCHIVOS) {
      for (const b of botonesDeIcono(readFileSync(resolve(SRC, file), 'utf-8'))) {
        expect(b.match(/aria-label=(\{[^}]*\}|"[^"]*")/)?.[0] ?? '').not.toMatch(/Tu rol/);
      }
    }
  });
});
