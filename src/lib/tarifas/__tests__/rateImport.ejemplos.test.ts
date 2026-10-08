// Los cuatro archivos de ejemplo, leídos de verdad.
//
// A diferencia de los tests con matrices escritas a mano, estos abren los archivos que están en
// `docs/ejemplos-importacion/` y los pasan por el MISMO código que usa la pantalla. Es la prueba de
// que el importador funciona con archivos reales, no solo con datos de laboratorio.
//
// Los cuatro son deliberadamente distintos entre sí: separadores, formatos de precio, filas de
// título, columnas invertidas y datos sucios.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { analyzeRateSheet, parseRateRows } from '../rateImport';
import { detectDelimiter, parseCsv } from '../sheetReader';
import type { NumberFormat, SheetMatrix } from '../costSheetParser';

// El archivo es un módulo ESM: `__dirname` no existe, se deriva de la URL del propio módulo.
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/ejemplos-importacion');

function csvMatrix(file: string): SheetMatrix {
  return parseCsv(readFileSync(resolve(DIR, file), 'utf8'));
}

function xlsxMatrix(file: string): SheetMatrix {
  const wb = XLSX.read(readFileSync(resolve(DIR, file)), { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!, {
    header: 1, blankrows: false, defval: null,
  }) as SheetMatrix;
}

function importar(matrix: SheetMatrix, format: NumberFormat = 'auto') {
  const analysis = analyzeRateSheet(matrix);
  return { analysis, ...parseRateRows(matrix, analysis.firstDataRow, analysis.mapping, format) };
}

describe('tarifas-cofersa.csv — CSV con coma, sin sorpresas', () => {
  const { analysis, rates, skipped } = importar(csvMatrix('tarifas-cofersa.csv'));

  it('detecta la coma como separador', () => {
    expect(detectDelimiter(readFileSync(resolve(DIR, 'tarifas-cofersa.csv'), 'utf8'))).toBe(',');
  });

  it('encuentra las columnas y no descarta nada', () => {
    expect(analysis.mapping).toEqual({ truckType: 0, price: 1 });
    expect(skipped).toHaveLength(0);
  });

  it('importa las cinco tarifas', () => {
    expect(rates.map((r) => `${r.truckType}=${r.price}`)).toEqual([
      'NPR=400', 'NKR=350', 'FRR=520', 'FVR=680', 'Cabezal T3=1250',
    ]);
  });
});

describe('tarifas-epa.csv — punto y coma, títulos, símbolos y datos sucios', () => {
  const contenido = readFileSync(resolve(DIR, 'tarifas-epa.csv'), 'utf8');
  const { analysis, rates, skipped } = importar(csvMatrix('tarifas-epa.csv'), 'es');

  it('detecta el punto y coma que exporta Excel en español', () => {
    expect(detectDelimiter(contenido)).toBe(';');
  });

  it('saltea las dos filas de título', () => {
    expect(analysis.headerRow).toBe(2);
    expect(analysis.notes.join(' ')).toContain('2 fila(s) de título');
  });

  it('lee el precio en los cuatro formatos que trae el archivo', () => {
    // "400 $", "$350", "520$": el símbolo puede ir de cualquier lado o no estar.
    // "1.250,00 $": con formato español, el punto es separador de miles — 1250, no 1,25.
    expect(rates.map((r) => `${r.truckType}=${r.price}`)).toEqual([
      'NPR=400', 'NKR=350', 'FRR=520', 'Cabezal=1250',
    ]);
  });

  it('descarta la fila sin precio y la de total, diciendo por qué', () => {
    expect(skipped.map((s) => s.truckType)).toEqual(['FVR', 'TOTAL']);
    expect(skipped[0]!.reason).toContain('a convenir');
    expect(skipped[1]!.reason).toContain('total');
  });
});

describe('tarifas-beval.xlsx — Excel simple', () => {
  const { analysis, rates, skipped } = importar(xlsxMatrix('tarifas-beval.xlsx'));

  it('lee el Excel y encuentra las columnas', () => {
    expect(analysis.mapping).toEqual({ truckType: 0, price: 1 });
    expect(skipped).toHaveLength(0);
  });

  it('importa las cuatro tarifas', () => {
    expect(rates.map((r) => `${r.truckType}=${r.price}`)).toEqual([
      'NPR=400', 'NKR=350', 'FRR=520', 'FVR=680',
    ]);
  });
});

describe('tarifas-andina.xlsx — Excel difícil: columnas invertidas y un duplicado', () => {
  const { analysis, rates, skipped } = importar(xlsxMatrix('tarifas-andina.xlsx'));

  it('encuentra el encabezado bajo las filas de título', () => {
    expect(analysis.headerRow).toBe(2);
  });

  it('identifica las columnas aunque el precio venga PRIMERO y haya una columna de por medio', () => {
    // Precio | Observaciones | Tipo de Camión
    expect(analysis.mapping).toEqual({ truckType: 2, price: 0 });
  });

  it('importa las tarifas con su símbolo de moneda', () => {
    expect(rates.map((r) => `${r.truckType}=${r.price}`)).toEqual([
      'Furgón chico=20', 'NPR=45', 'NKR=60', 'Cabezal=120',
    ]);
  });

  it('descarta el tipo de vehículo repetido e indica con cuál choca', () => {
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.truckType).toBe('NPR');
    expect(skipped[0]!.reason).toContain('fila 5');
  });
});
