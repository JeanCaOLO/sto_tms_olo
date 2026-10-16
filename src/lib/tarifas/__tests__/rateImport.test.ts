// Importación de tarifas base por tipo de vehículo, y lectura de CSV.
//
// El caso que más importa es el del precio: la consigna es que se tome el número venga como venga
// —"20", "20$", "20 $"— así que eso se prueba explícitamente, formato por formato.

import { describe, expect, it } from 'vitest';
import { analyzeRateSheet, parseRateRows } from '../rateImport';
import { detectDelimiter, parseCsv, splitCsvLine } from '../sheetReader';
import type { SheetMatrix } from '../costSheetParser';

// ── Lectura de CSV ────────────────────────────────────────────────────────────────────────────

describe('detectDelimiter', () => {
  it('detecta la coma', () => {
    expect(detectDelimiter('Tipo,Tarifa\nNPR,400\nNKR,350')).toBe(',');
  });

  it('detecta el punto y coma, que es lo que exporta Excel en español', () => {
    expect(detectDelimiter('Tipo;Tarifa\nNPR;400\nNKR;350')).toBe(';');
  });

  it('detecta el tabulador', () => {
    expect(detectDelimiter('Tipo\tTarifa\nNPR\t400')).toBe('\t');
  });

  it('no se deja engañar por comas dentro del contenido', () => {
    // Las descripciones tienen comas, pero el separador real es el punto y coma: solo él parte
    // todas las líneas en la misma cantidad de campos.
    const csv = 'Tipo;Tarifa\n"NPR, 3.5 toneladas";400\n"NKR, liviano";350';
    expect(detectDelimiter(csv)).toBe(';');
  });
});

describe('splitCsvLine', () => {
  it('respeta las comillas: un separador adentro es parte del dato', () => {
    expect(splitCsvLine('"NPR, grande",400', ',')).toEqual(['NPR, grande', '400']);
  });

  it('entiende la comilla escapada', () => {
    expect(splitCsvLine('"Camión ""NPR""",400', ',')).toEqual(['Camión "NPR"', '400']);
  });
});

describe('parseCsv', () => {
  it('saca el BOM que agrega Excel al guardar', () => {
    const matrix = parseCsv('﻿Tipo,Tarifa\nNPR,400');
    expect(matrix[0]).toEqual(['Tipo', 'Tarifa']);
  });

  it('ignora las líneas vacías', () => {
    expect(parseCsv('Tipo,Tarifa\n\nNPR,400\n\n')).toHaveLength(2);
  });
});

// ── El precio, venga como venga ───────────────────────────────────────────────────────────────

describe('el precio se lee en cualquier formato', () => {
  const casos: [string, string][] = [
    ['20', '20'],
    ['20$', '20'],
    ['20 $', '20'],
    ['$20', '20'],
    ['$ 20', '20'],
    ['20 USD', '20'],
    ['1.200,50', '1200.5'],
    ['1,200.50', '1200.5'],
    ['  400,00  ', '400'],
  ];

  it.each(casos)('lee "%s" como %s', (entrada, esperado) => {
    const matrix: SheetMatrix = [['Tipo', 'Tarifa'], ['NPR', entrada]];
    const { rates } = parseRateRows(matrix, 1, { truckType: 0, price: 1 });

    expect(rates).toHaveLength(1);
    expect(rates[0].price).toBe(esperado);
  });

  // "20.000" es genuinamente ambiguo: veinte mil en formato español, veinte en inglés. El sistema
  // no adivina — el importador deja elegir el formato, y acá se fija que las dos lecturas funcionen.
  it('un punto con tres dígitos se resuelve según el formato elegido', () => {
    const matrix: SheetMatrix = [['Tipo', 'Tarifa'], ['NPR', '₡20.000']];

    // En español son veinte mil; en inglés, veinte (el cero final se normaliza: 20.000 === 20).
    expect(parseRateRows(matrix, 1, { truckType: 0, price: 1 }, 'es').rates[0].price).toBe('20000');
    expect(parseRateRows(matrix, 1, { truckType: 0, price: 1 }, 'en').rates[0].price).toBe('20');
  });

  it('el formato español lee la coma como decimal y el punto como miles', () => {
    const matrix: SheetMatrix = [['Tipo', 'Tarifa'], ['NPR', '1.200,50']];
    expect(parseRateRows(matrix, 1, { truckType: 0, price: 1 }, 'es').rates[0].price).toBe('1200.5');
  });

  it('el formato inglés lee el punto como decimal y la coma como miles', () => {
    const matrix: SheetMatrix = [['Tipo', 'Tarifa'], ['NPR', '1,200.50']];
    expect(parseRateRows(matrix, 1, { truckType: 0, price: 1 }, 'en').rates[0].price).toBe('1200.5');
  });

  it('conserva el valor original para poder mostrarlo al lado', () => {
    const matrix: SheetMatrix = [['Tipo', 'Tarifa'], ['NPR', '20 $']];
    const { rates } = parseRateRows(matrix, 1, { truckType: 0, price: 1 });
    expect(rates[0]).toMatchObject({ price: '20', rawPrice: '20 $' });
  });
});

// ── Detección de columnas ─────────────────────────────────────────────────────────────────────

describe('analyzeRateSheet', () => {
  it('reconoce las columnas por el nombre del encabezado', () => {
    const matrix: SheetMatrix = [['Tipo de Camión', 'Tarifa'], ['NPR', 400]];
    const a = analyzeRateSheet(matrix);

    expect(a.mapping).toEqual({ truckType: 0, price: 1 });
    expect(a.headerRow).toBe(0);
    expect(a.firstDataRow).toBe(1);
  });

  it('reconoce sinónimos habituales', () => {
    const matrix: SheetMatrix = [['Vehiculo', 'Precio'], ['NKR', '350 $']];
    expect(analyzeRateSheet(matrix).mapping).toEqual({ truckType: 0, price: 1 });
  });

  it('cuando el encabezado no dice nada, decide por el contenido', () => {
    const matrix: SheetMatrix = [['A', 'B'], ['NPR', 400], ['NKR', 350]];
    expect(analyzeRateSheet(matrix).mapping).toEqual({ truckType: 0, price: 1 });
  });

  it('funciona con las columnas al revés', () => {
    const matrix: SheetMatrix = [['Tarifa', 'Tipo de Camión'], [400, 'NPR']];
    expect(analyzeRateSheet(matrix).mapping).toEqual({ truckType: 1, price: 0 });
  });

  it('saltea las filas de título y avisa', () => {
    const matrix: SheetMatrix = [
      ['Tarifas Cofersa 2026', null],
      ['Vigentes desde enero', null],
      ['Tipo de Camión', 'Tarifa'],
      ['NPR', 400],
    ];
    const a = analyzeRateSheet(matrix);

    expect(a.headerRow).toBe(2);
    expect(a.firstDataRow).toBe(3);
    expect(a.notes.join(' ')).toContain('2 fila(s) de título');
  });
});

// ── Extracción ────────────────────────────────────────────────────────────────────────────────

describe('parseRateRows', () => {
  const mapping = { truckType: 0, price: 1 };

  it('importa varias tarifas de una', () => {
    const matrix: SheetMatrix = [
      ['Tipo de Camión', 'Tarifa'],
      ['NPR', '400 $'],
      ['NKR', '350 $'],
      ['FRR', '520 $'],
    ];
    const { rates, skipped } = parseRateRows(matrix, 1, mapping);

    expect(rates.map((r) => [r.truckType, r.price])).toEqual([
      ['NPR', '400'], ['NKR', '350'], ['FRR', '520'],
    ]);
    expect(skipped).toHaveLength(0);
  });

  it('descarta la fila de total', () => {
    const matrix: SheetMatrix = [
      ['Tipo', 'Tarifa'], ['NPR', 400], ['TOTAL', 400],
    ];
    const { rates, skipped } = parseRateRows(matrix, 1, mapping);

    expect(rates).toHaveLength(1);
    expect(skipped[0].reason).toContain('total');
  });

  it('descarta un tipo de vehículo repetido y dice con cuál choca', () => {
    const matrix: SheetMatrix = [
      ['Tipo', 'Tarifa'], ['NPR', 400], ['npr', 500],
    ];
    const { rates, skipped } = parseRateRows(matrix, 1, mapping);

    expect(rates).toHaveLength(1);
    expect(skipped[0].reason).toContain('fila 2');
  });

  it('informa la fila cuyo precio no se puede leer, en vez de importarla en cero', () => {
    const matrix: SheetMatrix = [
      ['Tipo', 'Tarifa'], ['NPR', 400], ['NKR', 'a convenir'],
    ];
    const { rates, skipped } = parseRateRows(matrix, 1, mapping);

    expect(rates).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ truckType: 'NKR', sourceRow: 3 });
    expect(skipped[0].reason).toContain('a convenir');
  });

  it('rechaza precios negativos', () => {
    const matrix: SheetMatrix = [['Tipo', 'Tarifa'], ['NPR', '(400)']];
    const { skipped } = parseRateRows(matrix, 1, mapping);
    expect(skipped[0].reason).toContain('negativo');
  });

  it('ignora filas totalmente vacías sin reportarlas', () => {
    const matrix: SheetMatrix = [
      ['Tipo', 'Tarifa'], ['NPR', 400], [null, null], ['NKR', 350],
    ];
    const { rates, skipped } = parseRateRows(matrix, 1, mapping);
    expect(rates).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });
});

// ── De punta a punta, desde el texto del CSV ──────────────────────────────────────────────────

describe('un CSV completo, de texto a tarifas', () => {
  it('con punto y coma, precios con símbolo y título arriba', () => {
    const csv = [
      'Tarifas EPA 2026;',
      'Tipo de Camión;Precio',
      'NPR;400 $',
      'NKR;$350',
      'FRR;520$',
    ].join('\n');

    const matrix = parseCsv(csv);
    const analysis = analyzeRateSheet(matrix);
    const { rates, skipped } = parseRateRows(matrix, analysis.firstDataRow, analysis.mapping);

    expect(analysis.headerRow).toBe(1);
    expect(skipped).toHaveLength(0);
    expect(rates.map((r) => `${r.truckType}=${r.price}`)).toEqual(['NPR=400', 'NKR=350', 'FRR=520']);
  });
});
