// Lectura de planillas de costos.
//
// Las matrices de estas pruebas REPLICAN las formas reales de `Estructura_Costos_Transporte.xlsx`
// (5 hojas, 5 formas distintas, ninguna con el encabezado en la primera fila). Se copian acá en vez
// de leer el archivo porque no está versionado: el test tiene que correr en cualquier clon.

import { describe, expect, it } from 'vitest';
import {
  analyzeSheet, codeFromLabel, detectCurrency, detectDriver, detectHeaderRow, parseAmount,
  parseCostRows, type SheetMatrix,
} from '../costSheetParser';

// ── Hojas reales del archivo de ejemplo ───────────────────────────────────────────────────────

const HOJA_CONDUCTOR: SheetMatrix = [
  ['Costos del Conductor', null],
  ['Mensuales · se dividen entre días operativos', null],
  ['Concepto', 'Monto Mensual (₡)'],
  ['Salario Chofer', 820600],
  ['Aguinaldo Chofer', 83333.33],
  ['Seguro (terceros)', 19000],
  ['Marchamo', 18949.16],
  ['DEKRA', 888],
  ['Zapatos y chaleco', 4000],
  ['TOTAL MENSUAL', 946770.49],
];

const HOJA_DEPRECIACION: SheetMatrix = [
  ['Depreciación por Tipo de Camión', null, null, null],
  ['Valor del vehículo ÷ vida útil en meses = cuota mensual', null, null, null],
  ['Tipo', 'Valor Vehículo (₡)', 'Vida Útil (meses)', 'Cuota/Mes (₡)'],
  ['1-2.5 Ton', 10000000, 60, 166666.666666667],
  ['3-4.5 Ton  ← activo', 20000000, 72, 277777.777777778],
  ['5-7 Ton', 35000000, 72, 486111.111111111],
];

const HOJA_MANTENIMIENTO: SheetMatrix = [
  ['Componentes de Mantenimiento', null, null, null, null],
  ['Costo por KM · tipo activo actual: T3', null, null, null, null],
  ['Componente', 'Tipo', 'Frec. T3', 'Costo T3 (₡)', '₡/KM activo'],
  ['Filtro de Agua', 'km', 15000, 11300, 0.7533],
  ['Filtro de Aire', 'km', 15000, 18080, 1.2053],
  ['Filtro de Aceite', 'km', 5000, 9040, 1.808],
];

// ── parseAmount ───────────────────────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  it('conserva la precisión completa, sin pasar por float de presentación', () => {
    expect(parseAmount(277777.777777778)).toBe('277777.777777778');
    expect(parseAmount(0.7533)).toBe('0.7533');
  });

  it('entiende separador de miles y coma decimal', () => {
    expect(parseAmount('1.725.770,68')).toBe('1725770.68');
    expect(parseAmount('1,725,770.68')).toBe('1725770.68');
    expect(parseAmount('946.770,49')).toBe('946770.49');
  });

  it('distingue coma de miles de coma decimal por la cantidad de dígitos', () => {
    expect(parseAmount('1,500')).toBe('1500');   // miles
    expect(parseAmount('1,50')).toBe('1.5');     // decimal
  });

  it('saca símbolos de moneda y espacios', () => {
    expect(parseAmount('₡ 820 600')).toBe('820600');
    expect(parseAmount('$1,200.50')).toBe('1200.5');
  });

  it('lee los negativos entre paréntesis, como los escriben las planillas contables', () => {
    expect(parseAmount('(1.200,50)')).toBe('-1200.5');
  });

  it('devuelve null para lo que no es un número', () => {
    expect(parseAmount('TOTAL MENSUAL')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('1 UND')).toBe('1'); // cantidad con unidad: se queda con el número
  });
});

// ── Detección de encabezado ───────────────────────────────────────────────────────────────────

describe('detectHeaderRow', () => {
  it('saltea título y subtítulo y encuentra el encabezado real', () => {
    expect(detectHeaderRow(HOJA_CONDUCTOR)).toBe(2);
    expect(detectHeaderRow(HOJA_DEPRECIACION)).toBe(2);
    expect(detectHeaderRow(HOJA_MANTENIMIENTO)).toBe(2);
  });

  it('encuentra el encabezado cuando sí está en la primera fila', () => {
    expect(detectHeaderRow([['Concepto', 'Monto'], ['Peaje', 100]])).toBe(0);
  });

  it('devuelve -1 cuando no hay nada que parezca un encabezado', () => {
    expect(detectHeaderRow([['Solo un título', null], [null, null]])).toBe(-1);
  });
});

// ── Moneda y driver ───────────────────────────────────────────────────────────────────────────

describe('detección de moneda y de driver', () => {
  it('saca la moneda del encabezado, que es donde la ponen las planillas', () => {
    expect(detectCurrency(['Concepto', 'Monto Mensual (₡)'])).toBe('CRC');
    expect(detectCurrency(['Costo (USD)'])).toBe('USD');
    expect(detectCurrency(['Concepto', 'Monto'])).toBeNull();
  });

  it('propone el driver según cómo esté redactada la hoja', () => {
    expect(detectDriver(['Mensuales · se dividen entre días operativos'])).toBe('PER_MONTH_PRORATED');
    expect(detectDriver(['Costo por KM · tipo activo T3'])).toBe('PER_KM');
    expect(detectDriver(['Costo fijo diario'])).toBe('PER_DAY');
    expect(detectDriver(['Conceptos varios'])).toBe('FIXED');
  });
});

// ── Análisis completo ─────────────────────────────────────────────────────────────────────────

describe('analyzeSheet', () => {
  it('sobre la hoja de conductor propone concepto + monto y detecta colones y prorrateo mensual', () => {
    const analysis = analyzeSheet(HOJA_CONDUCTOR);

    expect(analysis.headerRow).toBe(2);
    expect(analysis.firstDataRow).toBe(3);
    expect(analysis.detectedCurrency).toBe('CRC');
    expect(analysis.suggestedDriver).toBe('PER_MONTH_PRORATED');
    expect(analysis.columns.map((c) => c.suggested)).toEqual(['label', 'amount']);
  });

  it('sobre la de depreciación NO adivina cuál de las tres columnas numéricas es el importe', () => {
    const analysis = analyzeSheet(HOJA_DEPRECIACION);

    // Propone la primera numérica, pero la correcta es "Cuota/Mes": lo decide la persona. Es el
    // motivo de que el importador pida confirmación en vez de importar de una.
    expect(analysis.columns[0].suggested).toBe('label');
    expect(analysis.columns[1].suggested).toBe('amount');
    expect(analysis.columns[3].header).toBe('Cuota/Mes (₡)');
    expect(analysis.columns[3].suggested).toBe('ignore');
  });

  it('avisa cuántas filas de título salteó', () => {
    expect(analyzeSheet(HOJA_CONDUCTOR).notes.join(' ')).toContain('2 fila(s) de título');
  });

  it('avisa cuando no encuentra encabezado', () => {
    const analysis = analyzeSheet([['Solo un título', null], [null, null]]);
    expect(analysis.headerRow).toBe(-1);
    expect(analysis.notes.join(' ')).toContain('No se encontró');
  });
});

// ── Extracción ────────────────────────────────────────────────────────────────────────────────

describe('parseCostRows', () => {
  const mapping = { label: 0, amount: 1, unit: null, code: null };

  it('importa los conceptos y DESCARTA la fila de total', () => {
    const { rows, skipped } = parseCostRows(
      HOJA_CONDUCTOR, { firstDataRow: 3 }, mapping, 'PER_MONTH_PRORATED',
    );

    expect(rows.map((r) => r.label)).toEqual([
      'Salario Chofer', 'Aguinaldo Chofer', 'Seguro (terceros)', 'Marchamo', 'DEKRA', 'Zapatos y chaleco',
    ]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].label).toBe('TOTAL MENSUAL');
    expect(skipped[0].reason).toContain('duplicaría');
  });

  it('la suma de lo importado coincide con el total que traía la planilla', () => {
    const { rows } = parseCostRows(HOJA_CONDUCTOR, { firstDataRow: 3 }, mapping, 'PER_MONTH_PRORATED');
    const suma = rows.reduce((acc, r) => acc + Number(r.amount), 0);

    // 946770.49 es el "TOTAL MENSUAL" de la planilla: si no coincide, algo se perdió al leer.
    expect(suma).toBeCloseTo(946770.49, 2);
  });

  it('genera códigos estables, sin tildes ni espacios', () => {
    const { rows } = parseCostRows(HOJA_CONDUCTOR, { firstDataRow: 3 }, mapping, 'PER_MONTH_PRORATED');
    expect(rows[0].code).toBe('SALARIO_CHOFER');
    expect(rows[2].code).toBe('SEGURO_TERCEROS');
  });

  it('desempata códigos repetidos en vez de pisar una fila con otra', () => {
    const matrix: SheetMatrix = [
      ['Concepto', 'Monto'],
      ['Peaje', 10],
      ['peaje', 20],
    ];
    const { rows } = parseCostRows(matrix, { firstDataRow: 1 }, mapping, 'FIXED');
    expect(rows.map((r) => r.code)).toEqual(['PEAJE', 'PEAJE_2']);
  });

  it('informa las filas con importe ilegible en vez de importarlas en cero', () => {
    const matrix: SheetMatrix = [
      ['Concepto', 'Monto'],
      ['Salario', 100],
      ['Viáticos', 'a definir'],
    ];
    const { rows, skipped } = parseCostRows(matrix, { firstDataRow: 1 }, mapping, 'FIXED');

    expect(rows).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ label: 'Viáticos', sourceRow: 3 });
    expect(skipped[0].reason).toContain('no es un número');
  });

  it('ignora las filas totalmente vacías sin reportarlas como problema', () => {
    const matrix: SheetMatrix = [
      ['Concepto', 'Monto'],
      ['Salario', 100],
      [null, null],
      ['Seguro', 50],
    ];
    const { rows, skipped } = parseCostRows(matrix, { firstDataRow: 1 }, mapping, 'FIXED');
    expect(rows).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it('permite mapear una columna numérica distinta de la primera', () => {
    // El caso de la hoja de depreciación: el importe correcto es la CUARTA columna.
    const { rows } = parseCostRows(
      HOJA_DEPRECIACION, { firstDataRow: 3 }, { label: 0, amount: 3, unit: null, code: null }, 'PER_MONTH_PRORATED',
    );

    expect(rows).toHaveLength(3);
    expect(rows[1].label).toBe('3-4.5 Ton  ← activo');
    expect(rows[1].amount).toBe('277777.777777778');
  });

  it('toma la unidad de la columna que se le indique', () => {
    const { rows } = parseCostRows(
      HOJA_MANTENIMIENTO, { firstDataRow: 3 }, { label: 0, amount: 4, unit: 1, code: null }, 'PER_KM',
    );

    expect(rows[0]).toMatchObject({ label: 'Filtro de Agua', amount: '0.7533', unit: 'km', driver: 'PER_KM' });
  });
});

describe('codeFromLabel', () => {
  it('normaliza tildes, símbolos y espacios', () => {
    expect(codeFromLabel('Depreciación 3-4.5 Ton')).toBe('DEPRECIACION_3_4_5_TON');
    expect(codeFromLabel('  ')).toBe('FILA');
  });
});
