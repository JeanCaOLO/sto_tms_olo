// Un bloqueo o un error se pinta en rojo; el ámbar queda para avisos que dejan seguir (p. ej. "se puede liquidar igual").
// Cada caso busca el texto del mensaje y revisa la etiqueta que lo envuelve (las 3 líneas anteriores).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

function envoltura(file: string, texto: string): string {
  const lines = readFileSync(resolve(SRC, file), 'utf-8').split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(texto));
  expect(i, `${file}: no aparece "${texto}"`).toBeGreaterThanOrEqual(0);
  return lines.slice(Math.max(0, i - 3), i + 1).join('\n');
}

const ERRORES: [string, string][] = [
  ['pages/liquidaciones/components/LiquidarViajeNotices.tsx', 'calculation.notLiquidableReason}'],
  ['pages/liquidaciones/components/lote/LoteViajeItem.tsx', "text: 'Bloqueado'"],
  ['pages/liquidaciones/parts/VariablesSection.tsx', 'variables que el transportista no declaró'],
  ['pages/reglas-tarifa/components/CountrySettingsCard.tsx', 'sin ella no se puede liquidar'],
  ['pages/reglas-tarifa/components/import-rate-table/ImportRateTableModeAndPreview.tsx', 'El archivo repite estas combinaciones'],
];

const AVISOS: [string, string][] = [
  ['pages/liquidaciones/parts/ContractBaseBanner.tsx', 'Se puede liquidar igual'],
  ['pages/liquidaciones/components/CalculationSidebar.tsx', 'calculation.warnings.map'],
];

describe('bloqueos y errores en rojo', () => {
  it.each(ERRORES)('%s: "%s"', (file, texto) => {
    const tag = envoltura(file, texto);
    expect(tag).toMatch(/red-(50|600|700|800)/);
    expect(tag).not.toMatch(/amber-/);
  });
});

describe('avisos que dejan seguir siguen en ámbar', () => {
  it.each(AVISOS)('%s: "%s"', (file, texto) => {
    expect(envoltura(file, texto)).toMatch(/amber-/);
  });
});
