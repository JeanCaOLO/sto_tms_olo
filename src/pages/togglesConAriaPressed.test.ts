// Un botón que se queda "encendido" (modo, filtro, negación) debe decir su estado con aria-pressed; con el color solo, el
// lector de pantalla no sabe cuál está activo. Y un botón cuyo nombre ya cambia con el estado ("Pausar"/"Reanudar") no
// lleva aria-pressed: diría el estado dos veces al revés.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf-8');
const BOTON = /<button\b(?:=>|[^>])*>/g;
const ES_TOGGLE = /teal-700 shadow-sm|negateClass|bg-teal-600 text-white border-teal-600/;

const TOGGLES = [
  'pages/liquidaciones/components/InterruptorVista.tsx',
  'pages/liquidaciones/page.tsx',
  'pages/reglas-tarifa/components/rule-modal/conditions/ConditionRowsEditor.tsx',
  'pages/reglas-tarifa/components/rule-modal/RuleConditionSection.tsx',
  'components/tarifas/CalcBreakdownPanelLevels.tsx',
];

describe('toggles con aria-pressed', () => {
  it.each(TOGGLES)('%s', (file) => {
    const toggles = [...read(file).matchAll(BOTON)].map((m) => m[0]).filter((b) => ES_TOGGLE.test(b));
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles.filter((b) => !/aria-pressed=/.test(b))).toEqual([]);
  });

  it('el botón de pausa del simulador no lleva aria-pressed (su nombre ya cambia con el estado)', () => {
    const pausa = [...read('pages/tracking/components/SimulacionControles.tsx').matchAll(BOTON)].map((m) => m[0]).find((b) => b.includes('simPlay'));
    expect(pausa).toBeDefined();
    expect(pausa).not.toMatch(/aria-pressed=/);
  });
});
