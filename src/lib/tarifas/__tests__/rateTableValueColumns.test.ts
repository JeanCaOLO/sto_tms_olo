// @vitest-environment jsdom
//
// Tarifarios con varias columnas de valor: un mismo tarifario da, por ejemplo, "flete" y "peaje" para
// la misma combinación, y cada regla elige la que usa. Y los chequeos de rango de la carga masiva.

import { beforeEach, describe, expect, it } from 'vitest';
import { calculate } from '../index';
import {
  bulkUpsertRows, listRateTableRows, saveRateRow, saveRateTable, validateImportedRanges,
  type RateTableInput,
} from '../rateTablesDataSource';
import { analyzeRateTableSheet, parseRateTableSheet } from '../rateTableImport';
import { compileBuilder } from '../rule-builder';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, RateTable, RateTableRow, RuleBuilderForm } from '../types';

beforeEach(() => { localStorage.clear(); });

const nuevaTabla = (overrides: Partial<RateTableInput> = {}): RateTableInput => ({
  countryId: 'CR', partyId: null, code: 'TARIFARIO_MULTI', name: 'Tarifario con dos valores',
  keyColumns: ['truckTypeId'], valueColumns: ['flete', 'peaje'], active: true, ...overrides,
});

async function crearTabla(overrides: Partial<RateTableInput> = {}): Promise<RateTable> {
  const r = await saveRateTable(nuevaTabla(overrides));
  if (r.status !== 'saved') throw new Error(`no se guardó: ${JSON.stringify(r)}`);
  return r.table;
}

describe('definir las columnas de valor', () => {
  it('se guardan con la tabla', async () => {
    const t = await crearTabla();
    expect(t.valueColumns).toEqual(['flete', 'peaje']);
  });

  it.each([
    [['flete', 'flete'], /repetida/],
    [['flete', ''], /sin nombre/],
    [['flete y peaje'], /letras, números/],
    [['amount'], /reservados/],
  ])('rechaza %j', async (valueColumns, mensaje) => {
    const r = await saveRateTable(nuevaTabla({ valueColumns: valueColumns as string[] }));
    expect(r.status).toBe('invalid');
    if (r.status === 'invalid') expect(r.errors.valueColumns).toMatch(mensaje);
  });
});

describe('filas con varios valores', () => {
  it('guarda el valor principal y los adicionales', async () => {
    const t = await crearTabla();
    const r = await saveRateRow({ tableId: t.id, key: ['NPR'], amount: '100', values: { flete: '80', peaje: '20' }, active: true });
    expect(r.status).toBe('saved');
    const [fila] = await listRateTableRows(t.id);
    expect(fila.amount).toBe('100');
    expect(fila.values).toEqual({ flete: '80', peaje: '20' });
  });

  it('un valor vacío deja a la fila sin ese valor (no lo guarda como cero)', async () => {
    const t = await crearTabla();
    await saveRateRow({ tableId: t.id, key: ['NPR'], amount: '100', values: { flete: '80', peaje: '' }, active: true });
    expect((await listRateTableRows(t.id))[0].values).toEqual({ flete: '80' });
  });

  it('rechaza una columna que el tarifario no tiene o un valor que no es número', async () => {
    const t = await crearTabla();
    const otra = await saveRateRow({ tableId: t.id, key: ['NPR'], amount: '1', values: { extra: '5' }, active: true });
    expect(otra.status === 'invalid' && otra.errors.values).toMatch(/no tiene la columna/);
    const mala = await saveRateRow({ tableId: t.id, key: ['NPR'], amount: '1', values: { flete: 'abc' }, active: true });
    expect(mala.status === 'invalid' && mala.errors.values).toMatch(/número/);
  });

  it('al quitar una columna de la tabla se borra de las filas', async () => {
    const t = await crearTabla();
    await saveRateRow({ tableId: t.id, key: ['NPR'], amount: '100', values: { flete: '80', peaje: '20' }, active: true });
    await saveRateTable(nuevaTabla({ valueColumns: ['flete'] }), t.id);
    expect((await listRateTableRows(t.id))[0].values).toEqual({ flete: '80' });
  });

  it('la carga masiva trae los valores adicionales y los pisa al actualizar', async () => {
    const t = await crearTabla();
    await bulkUpsertRows(t.id, [{ key: ['NPR'], amount: '100', values: { flete: '80' } }], 'merge');
    await bulkUpsertRows(t.id, [{ key: ['NPR'], amount: '110', values: { flete: '90', peaje: '20' } }], 'merge');
    const filas = await listRateTableRows(t.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ amount: '110', values: { flete: '90', peaje: '20' } });
  });
});

describe('el motor lee la columna que la regla pide', () => {
  const tabla: RateTable = {
    id: 'T1', countryId: 'VE', partyId: null, code: 'MULTI', name: 'multi',
    keyColumns: ['truckTypeId'], valueColumns: ['flete', 'peaje'], active: true,
  };
  const filas: RateTableRow[] = [
    { id: 'R1', tableId: 'T1', key: ['NPR'], amount: '500', values: { flete: '400', peaje: '60' }, order: 1, active: true },
    { id: 'R2', tableId: 'T1', key: ['NKR'], amount: '300', values: { flete: '250' }, order: 2, active: true },
  ];
  const { zoneGroups, zones, locations } = makeGeoVE();

  const liquidar = (column: string | undefined, truckTypeId = 'NPR') => {
    const input: CalculateInput = {
      country: makeCountryVE(),
      trip: makeTrip({ fleetType: 'OUTSOURCED', truckTypeId }),
      rules: [makeRule({
        code: 'TARIFA', stage: 'BASE',
        expression: { op: 'LOOKUP_TABLE', table: 'MULTI', ...(column ? { column } : {}), fallback: { op: 'FIXED', amount: '10.00' } },
      })],
      zones, zoneGroups, locations, ...makeOwnCostStructure(), marginPolicy: makeMarginPolicy(),
      rateTables: [tabla], rateTableRows: filas,
    };
    return calculate(input);
  };

  it('sin columna usa el valor principal', () => {
    expect(liquidar(undefined).totalLiquidado).toBe('500.00');
  });

  it('con columna usa ese valor', () => {
    expect(liquidar('flete').totalLiquidado).toBe('400.00');
    expect(liquidar('peaje').totalLiquidado).toBe('60.00');
  });

  it('si la fila no tiene ese valor cobra el respaldo y avisa', () => {
    const r = liquidar('peaje', 'NKR');
    expect(r.totalLiquidado).toBe('10.00');
    expect(r.warnings.some((w) => /no tiene valor en la columna "peaje"/.test(w))).toBe(true);
  });

  it('si el tarifario no tiene la columna cobra el respaldo y avisa', () => {
    const r = liquidar('inexistente');
    expect(r.totalLiquidado).toBe('10.00');
    expect(r.warnings.some((w) => /que no la tiene/.test(w))).toBe(true);
  });

  it('el desglose anota qué columna se leyó', () => {
    const r = liquidar('flete');
    expect(r.trace[0].tableMatch?.column).toBe('flete');
    expect(r.trace[0].inputs).toMatchObject({ tabla: 'MULTI', columna: 'flete' });
  });
});

describe('el constructor de reglas', () => {
  const form = (extra: Partial<RuleBuilderForm>): RuleBuilderForm => ({
    variable: null, operator: 'RATE_TABLE', value: '10', effect: 'INCREASE', rateTableCode: 'MULTI', ...extra,
  } as RuleBuilderForm);

  it('compila la columna elegida', () => {
    expect(compileBuilder(form({ rateTableColumn: 'flete' }))).toMatchObject({ op: 'LOOKUP_TABLE', table: 'MULTI', column: 'flete' });
  });
  it('sin columna no agrega el campo', () => {
    expect('column' in compileBuilder(form({ rateTableColumn: '' }))).toBe(false);
  });
});

describe('importar planillas con columnas de valor', () => {
  const matriz = [
    ['Camión', 'Flete', 'Peaje', 'Total'],
    ['NPR', '80', '20', '100'],
    ['NKR', '60', '', '60'],
  ];

  it('reconoce las columnas por su nombre y lee los valores', () => {
    const analisis = analyzeRateTableSheet(matriz, ['truckTypeId'], {}, ['flete', 'peaje']);
    expect(analisis.mapping.values).toEqual({ flete: 1, peaje: 2 });
    const { rows } = parseRateTableSheet(matriz, ['truckTypeId'], analisis);
    expect(rows[0]).toMatchObject({ key: ['NPR'], values: { flete: '80', peaje: '20' } });
    // Una celda vacía deja a la fila sin ese valor.
    expect(rows[1].values).toEqual({ flete: '60' });
  });

  it('sin columnas adicionales todo sigue igual', () => {
    const analisis = analyzeRateTableSheet(matriz, ['truckTypeId']);
    expect(analisis.mapping.values).toBeUndefined();
  });
});

describe('rangos en la carga masiva', () => {
  const tabla = { keyColumns: ['truckTypeId', 'km'] as RateTable['keyColumns'] };

  it('acepta tramos que no se pisan', () => {
    expect(validateImportedRanges(tabla, [
      { key: ['NPR', '0..100'], amount: '1' }, { key: ['NPR', '101..300'], amount: '2' }, { key: ['NPR', '301..'], amount: '3' },
    ])).toBeNull();
  });

  it('rechaza un rango mal formado, al revés o en una columna que no es numérica', () => {
    expect(validateImportedRanges(tabla, [{ key: ['NPR', '1..a'], amount: '1' }])).toMatch(/no es un rango válido/);
    expect(validateImportedRanges(tabla, [{ key: ['NPR', '300..100'], amount: '1' }])).toMatch(/al revés/);
    expect(validateImportedRanges(tabla, [{ key: ['1..5', '10..20'], amount: '1' }])).toMatch(/no es numérica/);
  });

  it('rechaza tramos que se pisan, dentro del archivo o contra lo que se conserva', () => {
    expect(validateImportedRanges(tabla, [
      { key: ['NPR', '0..150'], amount: '1' }, { key: ['NPR', '100..300'], amount: '2' },
    ])).toMatch(/se pisa/);
    expect(validateImportedRanges(tabla, [{ key: ['NPR', '100..300'], amount: '2' }], [{ key: ['NPR', '0..150'] }])).toMatch(/se pisa/);
    // Otro camión no cruza.
    expect(validateImportedRanges(tabla, [{ key: ['NKR', '100..300'], amount: '2' }], [{ key: ['NPR', '0..150'] }])).toBeNull();
  });

  it('la carga masiva no escribe nada si un rango es inválido', async () => {
    const r = await saveRateTable({
      countryId: 'CR', partyId: null, code: 'KM_TABLA', name: 'por km', keyColumns: ['km'], active: true,
    });
    if (r.status !== 'saved') throw new Error('no se guardó');
    const res = await bulkUpsertRows(r.table.id, [{ key: ['0..100'], amount: '1' }, { key: ['50..200'], amount: '2' }], 'replace');
    expect(res.error).toMatch(/se pisa/);
    expect(await listRateTableRows(r.table.id)).toHaveLength(0);
  });
});
