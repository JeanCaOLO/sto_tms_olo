// Las descripciones se buscan por el texto visible del elemento (ver `HintProvider`/`hintKey`). Una clave que ningún
// elemento puede producir es una descripción muerta; una genérica se pega donde no aplica. Estos tests fijan las
// correcciones de la auditoría: si agregas un hint, que su clave sea el texto real que se ve en pantalla.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildHints, hintKey } from '../../../components/base/hintKey';
import { TARIFADOR_HINTS } from './index';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const read = (relative: string) => readFileSync(resolve(SRC, relative), 'utf-8');
const hints = buildHints(TARIFADOR_HINTS);
const has = (text: string) => hintKey(text) in hints;

describe('claves de hints muertas o engañosas', () => {
  it.each(['Prioridad menor gana', 'Compañía opcional', 'Ver', 'Valor'])(
    '"%s" ya no existe: ningún elemento la produce o describe otra cosa',
    (key) => {
      expect(has(key)).toBe(false);
    },
  );

  it('el hint de "Prioridad" dice cómo se resuelve de verdad (gana el número menor, las otras se excluyen)', () => {
    expect(hints[hintKey('Prioridad')]).toMatch(/menor/i);
    expect(hints[hintKey('Prioridad')]).toMatch(/excluy/i);
  });

  it('"Re-liquidar" tiene su propio hint (anula la vigente y pide motivo)', () => {
    expect(hints[hintKey('Re-liquidar')]).toMatch(/anula/i);
    expect(hints[hintKey('Re-liquidar')]).toMatch(/motivo/i);
  });

  it('el hint de "Importe" no habla de reglas ni de efecto (se pega también a tarifarios e importación)', () => {
    expect(hints[hintKey('Importe')]).not.toMatch(/regla|efecto/i);
  });
});

describe('elementos con title nativo que anulaban su hint', () => {
  it('TripOrdersPanel: Incluir, Liquidar después y Anular no llevan title (el hint solo se muestra sin title)', () => {
    const src = read('pages/liquidaciones/components/TripOrdersPanel.tsx');
    expect(src).not.toMatch(/title="Volver a incluir el pedido"/);
    expect(src).not.toMatch(/title="Se reparte su parte/);
    expect(src).not.toMatch(/title="Sacar el pedido del reparto"/);
    expect(src).toMatch(/aria-label="Anular"/);
  });

  it('la columna de valor del panel de pedidos se llama como su hint ("Valor de la mercancía")', () => {
    expect(read('pages/liquidaciones/components/TripOrdersPanel.tsx')).toMatch(/header: 'Valor de la mercancía'/);
  });

  it('RulesSection: el botón de ver no usa el title genérico "Ver"', () => {
    expect(read('pages/reglas-tarifa/parts/RulesSection.tsx')).not.toMatch(/title="Ver"/);
  });

  it('ScenarioVerdict: el botón con el monto lleva aria-label fijo para resolver su hint', () => {
    expect(read('pages/reglas-tarifa/components/rule-tester/ScenarioVerdict.tsx')).toMatch(/aria-label="Fijar como el total esperado"/);
  });
});
