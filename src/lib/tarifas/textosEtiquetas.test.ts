// Etiquetas y ejemplos de Tarifas que no pueden mentir: el sistema es multi-país (cada país con su moneda), la bitácora no
// tiene roles "simulados" para el usuario, y una misma columna de auditoría no puede llamarse con tres nombres.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hintKey } from '../../components/base/hintKey';
import { TARIFADOR_HINTS } from './hints';
import { OPERATOR_HINTS } from './rule-builder/labels';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const read = (relative: string) => readFileSync(resolve(SRC, relative), 'utf-8');

describe('ejemplos sin moneda fija', () => {
  it('los ejemplos de operadores no usan "$" (cada país liquida en su moneda)', () => {
    expect(OPERATOR_HINTS.TIMES).not.toContain('$');
    expect(OPERATOR_HINTS.PER_BLOCK).not.toContain('$');
    expect(OPERATOR_HINTS.TIMES).toMatch(/por cada peaje, 20/);
  });

  it.each(['es', 'en'])('el bundle %s de etiquetas tampoco', (lang) => {
    const src = read(`i18n/local/${lang}/tarifasLabels.ts`);
    expect(src).not.toMatch(/operatorHint\.(TIMES|PER_BLOCK)'[^\n]*\$\d/);
  });
});

describe('bitácora', () => {
  it('no habla de "rol simulado": la columna se llama Rol', () => {
    expect(read('pages/reglas-tarifa/components/BitacoraTab.tsx')).not.toMatch(/rol simulado/i);
  });
});

describe('columna de auditoría de liquidaciones', () => {
  it('se llama Margen (como la pestaña "Alerta Margen"), no "Ganancia"', () => {
    const src = read('pages/liquidaciones/parts/settlementColumns.tsx');
    expect(src).toMatch(/header: 'Margen \(auditoría\)'/);
    expect(src).not.toMatch(/Ganancia \(auditoría\)/);
  });

  it('su hint está bajo la clave "Margen" y ya no bajo "Ganancia"', () => {
    const keys = Object.keys(TARIFADOR_HINTS).map(hintKey);
    expect(keys).toContain('margen');
    expect(keys).not.toContain('ganancia');
  });

  it('el aviso por pedidos no leídos habla de margen, no de "ganancia/pérdida"', () => {
    expect(read('lib/tarifas/tripSettlement.ts')).not.toMatch(/ganancia\/pérdida/);
  });
});

describe('veredicto de escenarios', () => {
  it('la diferencia se muestra como dinero, no como un número crudo', () => {
    const src = read('pages/reglas-tarifa/components/rule-tester/ScenarioVerdict.tsx');
    expect(src).toMatch(/formatMoney\(veredicto\.drift/);
    expect(src).not.toMatch(/diferencia \{veredicto\.drift\}/);
  });
});
