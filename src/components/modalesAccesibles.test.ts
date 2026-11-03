// Los modales de Tarifas usan el `Modal` compartido (role="dialog", aria-modal, Escape, foco atrapado y devuelto). Un
// overlay propio (`fixed inset-0`) no tiene nada de eso: el lector de pantalla no sabe que hay un diálogo y el teclado
// puede salirse de él.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const MODALES = [
  'pages/reglas-tarifa/components/DeleteConfirmModal.tsx',
  'pages/reglas-tarifa/components/ImportRateTableModal.tsx',
  'pages/reglas-tarifa/components/RateTableModal.tsx',
  'pages/liquidaciones/components/DetalleLiquidacionModal.tsx',
  'components/tarifas/CostTemplateModal.tsx',
  'components/feature/CsvImportModal.tsx',
];

describe('modales de Tarifas sobre el Modal compartido', () => {
  it.each(MODALES)('%s usa base/Modal y no un overlay propio', (file) => {
    const src = readFileSync(resolve(SRC, file), 'utf-8');
    expect(src).toMatch(/import Modal from '[./]+\/(components\/)?base\/Modal'/);
    expect(src).not.toMatch(/fixed inset-0/);
  });

  it('los que tienen datos sin guardar no se cierran con un clic en el fondo', () => {
    for (const file of ['pages/reglas-tarifa/components/ImportRateTableModal.tsx', 'pages/reglas-tarifa/components/RateTableModal.tsx']) {
      expect(readFileSync(resolve(SRC, file), 'utf-8')).toMatch(/closeOnBackdrop=\{false\}/);
    }
  });
});
