// Importación de un tarifario desde planilla.
//
// La forma del archivo la decide la CLAVE de la tabla, no el importador: un tarifario de zonas trae
// dos columnas de clave; uno de zona + camión + servicio trae tres. Lo que se prueba acá es que el
// mapeo automático acierte en los archivos que manda un transportista de verdad —encabezados en
// castellano, con acentos, sinónimos, importes con símbolo de moneda— y que cuando no acierta, no
// invente.

import { describe, expect, it } from 'vitest';
import {
  analyzeRateTableSheet, findDuplicateKeys, parseRateTableSheet,
} from '../rateTableImport';
import type { SheetMatrix } from '../costSheetParser';
import type { VarKey } from '../types';

const CLAVE_ZONAS: VarKey[] = ['originZone', 'destZone'];
const CLAVE_TRIPLE: VarKey[] = ['originZone', 'destZone', 'truckTypeId'];

const PLANILLA: SheetMatrix = [
  ['Zona Origen', 'Zona Destino', 'Tarifa'],
  ['SJO', 'LIM', '₡125.000'],
  ['SJO', 'PUN', '₡98.500'],
  ['LIM', 'SJO', '₡125.000'],
];

// ── Mapeo automático ──────────────────────────────────────────────────────────────────────────

describe('analyzeRateTableSheet', () => {
  it('reconoce los encabezados en castellano', () => {
    const { mapping, headerRow } = analyzeRateTableSheet(PLANILLA, CLAVE_ZONAS);
    expect(headerRow).toBe(0);
    expect(mapping).toEqual({ key: [0, 1], amount: 2 });
  });

  it('acierta con acentos y sinónimos', () => {
    // "Región", "Desde"/"Hasta", "Precio": lo que trae un archivo escrito a mano.
    const sheet: SheetMatrix = [
      ['Desde', 'Hasta', 'Precio'],
      ['SJO', 'LIM', '1000'],
    ];
    expect(analyzeRateTableSheet(sheet, CLAVE_ZONAS).mapping).toEqual({ key: [0, 1], amount: 2 });
  });

  it('no asigna dos veces la misma columna', () => {
    // "Origen" y "Zona origen" pegan los dos con la primera columna; la segunda tiene que irse a
    // otro lado o quedar sin asignar, nunca duplicarse.
    const sheet: SheetMatrix = [
      ['Zona origen', 'Zona origen', 'Monto'],
      ['SJO', 'LIM', '1000'],
    ];
    const { mapping } = analyzeRateTableSheet(sheet, CLAVE_ZONAS);
    expect(mapping.key[0]).not.toBe(mapping.key[1]);
  });

  it('sin encabezado de importe, toma la última columna con números', () => {
    const sheet: SheetMatrix = [
      ['Zona Origen', 'Zona Destino', 'XYZ'],
      ['SJO', 'LIM', '1000'],
      ['SJO', 'PUN', '2000'],
    ];
    const analysis = analyzeRateTableSheet(sheet, CLAVE_ZONAS);
    expect(analysis.mapping.amount).toBe(2);
    expect(analysis.notes.join(' ')).toContain('última columna');
  });

  it('sin encabezados reconocibles, propone las primeras columnas y lo dice', () => {
    const sheet: SheetMatrix = [
      ['A', 'B', 'C'],
      ['SJO', 'LIM', '1000'],
      ['SJO', 'PUN', '2000'],
    ];
    const analysis = analyzeRateTableSheet(sheet, CLAVE_ZONAS);
    expect(analysis.mapping.key).toEqual([0, 1]);
    expect(analysis.notes.join(' ')).toContain('No se reconoció');
  });

  it('avisa cuántas columnas de la clave quedaron sin asignar', () => {
    // Clave de tres columnas y una planilla que solo nombra dos: el importador tiene que decirlo,
    // porque la columna sin asignar se va a llenar de comodines en TODAS las filas.
    const analysis = analyzeRateTableSheet(PLANILLA, CLAVE_TRIPLE);
    expect(analysis.mapping.key[2]).toBeNull();
    expect(analysis.notes.join(' ')).toContain('sin asignar');
  });
});

// ── Lectura de las filas ──────────────────────────────────────────────────────────────────────

describe('parseRateTableSheet', () => {
  const analysis = { firstDataRow: 1, mapping: { key: [0, 1], amount: 2 } };

  it('limpia el símbolo de moneda y los separadores de miles', () => {
    const { rows } = parseRateTableSheet(PLANILLA, CLAVE_ZONAS, analysis, 'es');
    expect(rows.map((r) => r.amount)).toEqual(['125000', '98500', '125000']);
    expect(rows[0]?.key).toEqual(['SJO', 'LIM']);
  });

  it('conserva el valor original para poder mostrarlo al lado', () => {
    const { rows } = parseRateTableSheet(PLANILLA, CLAVE_ZONAS, analysis, 'es');
    expect(rows[0]?.rawAmount).toBe('₡125.000');
  });

  it('una celda de clave vacía queda como comodín', () => {
    // En un tarifario escrito a mano, la columna en blanco significa "cualquiera".
    const sheet: SheetMatrix = [
      ['Zona Origen', 'Zona Destino', 'Tarifa'],
      ['SJO', '', '1000'],
    ];
    expect(parseRateTableSheet(sheet, CLAVE_ZONAS, analysis).rows[0]?.key).toEqual(['SJO', '*']);
  });

  it('una columna de la clave sin mapear queda en comodín en todas las filas', () => {
    const sinMapear = { firstDataRow: 1, mapping: { key: [0, 1, null], amount: 2 } };
    const { rows } = parseRateTableSheet(PLANILLA, CLAVE_TRIPLE, sinMapear);
    expect(rows[0]?.key).toEqual(['SJO', 'LIM', '*']);
  });

  it('aparta la fila sin importe legible en vez de cobrarle cero', () => {
    // Un cero silencioso es una tarifa que nadie puso: apartarla con motivo la hace visible.
    const sheet: SheetMatrix = [
      ['Zona Origen', 'Zona Destino', 'Tarifa'],
      ['SJO', 'LIM', 'a convenir'],
      ['SJO', 'PUN', '1000'],
    ];
    const { rows, skipped } = parseRateTableSheet(sheet, CLAVE_ZONAS, analysis);

    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ sourceRow: 1, key: ['SJO', 'LIM'] });
    expect(skipped[0]?.reason).toContain('a convenir');
  });

  it('una línea de separación no ensucia la lista de problemas', () => {
    // Clave entera vacía y sin importe: es una fila en blanco o un total, no un error del usuario.
    const sheet: SheetMatrix = [
      ['Zona Origen', 'Zona Destino', 'Tarifa'],
      ['SJO', 'LIM', '1000'],
      ['', '', ''],
      ['', '', 'Total'],
    ];
    const { rows, skipped } = parseRateTableSheet(sheet, CLAVE_ZONAS, analysis);
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('sin columna de importe no devuelve nada', () => {
    const sinImporte = { firstDataRow: 1, mapping: { key: [0, 1], amount: null } };
    expect(parseRateTableSheet(PLANILLA, CLAVE_ZONAS, sinImporte).rows).toEqual([]);
  });

  it('el formato español y el inglés leen "20.000" distinto, y por eso se elige', () => {
    const sheet: SheetMatrix = [
      ['Zona Origen', 'Zona Destino', 'Tarifa'],
      ['SJO', 'LIM', '20.000'],
    ];
    expect(parseRateTableSheet(sheet, CLAVE_ZONAS, analysis, 'es').rows[0]?.amount).toBe('20000');
    expect(parseRateTableSheet(sheet, CLAVE_ZONAS, analysis, 'en').rows[0]?.amount).toBe('20');
  });
});

// ── Claves repetidas ──────────────────────────────────────────────────────────────────────────

describe('findDuplicateKeys', () => {
  const fila = (key: string[], amount: string) => ({ key, amount, rawAmount: amount, sourceRow: 0 });

  it('encuentra la combinación repetida', () => {
    // Importa porque dos filas con la misma clave son igual de específicas: el motor elegiría una
    // por orden y el importe saldría por sorteo.
    const repetidas = findDuplicateKeys([
      fila(['SJO', 'LIM'], '100'),
      fila(['SJO', 'PUN'], '200'),
      fila(['SJO', 'LIM'], '300'),
    ]);
    expect(repetidas).toEqual([['SJO', 'LIM']]);
  });

  it('no distingue mayúsculas', () => {
    expect(findDuplicateKeys([fila(['SJO', 'LIM'], '1'), fila(['sjo', 'lim'], '2')])).toHaveLength(1);
  });

  it('la reporta una sola vez aunque aparezca tres veces', () => {
    const repetidas = findDuplicateKeys([
      fila(['A', 'B'], '1'), fila(['A', 'B'], '2'), fila(['A', 'B'], '3'),
    ]);
    expect(repetidas).toHaveLength(1);
  });

  it('sin repeticiones no reporta nada', () => {
    expect(findDuplicateKeys([fila(['A', 'B'], '1'), fila(['A', 'C'], '2')])).toEqual([]);
  });
});
