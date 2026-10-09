// Cambio de base de cálculo: qué tipos de cobro ofrece un viaje, cómo reemplaza la base y que lo
// demás (otras fases, flota, totales) no se mueve ni se cobra dos veces.

import { describe, expect, it } from 'vitest';
import { calculate, listBaseMethods } from '../index';
import { describeCurrentBase, sourceSentence } from '../baseMethods';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip } from './fixtures';
import type { BaseMethodId, CalculateInput, Rule } from '../types';

const input = (over: Partial<CalculateInput> = {}): CalculateInput => ({
  country: makeCountryVE(),
  trip: makeTrip(),
  rules: [],
  ...makeGeoVE(),
  marginPolicy: makeMarginPolicy(),
  ...over,
});

const porKm = (rate = '2.50', over: Partial<Rule> = {}) =>
  makeRule({ code: 'BASE_KM', name: 'Base por km', stage: 'BASE', expression: { op: 'PER_KM', rate }, ...over });
const fija = (amount = '100') =>
  makeRule({ code: 'BASE_FIJA', name: 'Base fija', stage: 'BASE', expression: { op: 'FIXED', amount } });
const metodo = (list: ReturnType<typeof listBaseMethods>, id: BaseMethodId) => list.find((m) => m.id === id)!;

describe('qué tipos de cobro ofrece el viaje', () => {
  it('habilita solo los que tienen regla, y bloquea el resto con el motivo', () => {
    const lista = listBaseMethods(input({ rules: [porKm(), fija()] }));
    expect(metodo(lista, 'PER_KM')).toMatchObject({ available: true, source: { kind: 'RULE', ref: 'BASE_KM' } });
    expect(metodo(lista, 'FIXED').available).toBe(true);
    expect(metodo(lista, 'VOLUME')).toMatchObject({ available: false, reason: 'No hay información para este cálculo.' });
    expect(metodo(lista, 'PER_UNIT').available).toBe(false);
  });

  it('tendering siempre queda bloqueado: no tiene mecánica definida', () => {
    const lista = listBaseMethods(input({ rules: [porKm()] }));
    expect(metodo(lista, 'TENDERING').available).toBe(false);
  });

  it('un tarifario por zona cuenta como tarifa fija y su fuente es el tarifario', () => {
    const regla = makeRule({
      code: 'TARIFA_ZONA', stage: 'BASE',
      expression: { op: 'LOOKUP_TABLE', table: 'ZONAS_VE', fallback: { op: 'FIXED', amount: '0' } },
    });
    const fijaOpt = metodo(listBaseMethods(input({ rules: [regla] })), 'FIXED');
    expect(fijaOpt.source).toEqual({ kind: 'RATE_TABLE', ref: 'ZONAS_VE', label: 'Tarifario ZONAS_VE' });
  });

  it('una regla BASE cuya condición no se cumple no es información para este viaje', () => {
    const noAplica = porKm('2.50', { conditions: { p: 'EQ', left: 'km', right: 9999 } });
    expect(metodo(listBaseMethods(input({ rules: [noAplica] })), 'PER_KM').available).toBe(false);
  });

  it('en flota propia, el costo por km de la estructura habilita "por km"', () => {
    const lista = listBaseMethods(input({
      trip: makeTrip({ fleetType: 'OWN' }),
      ...makeOwnCostStructure({ costPerKm: '5', depreciationPerKm: '0' }),
    }));
    expect(metodo(lista, 'PER_KM')).toMatchObject({
      available: true,
      source: { kind: 'COST_STRUCTURE', label: 'Estructura de costos de la compañía' },
    });
  });
});

describe('cambiar la base reemplaza solo la base', () => {
  it('sin cambio, el resultado es el de siempre y no trae información de base', () => {
    const r = calculate(input({ rules: [porKm(), fija()] }));
    expect(r.base).toBeUndefined();
    // Las dos reglas BASE se suman, como antes.
    expect(r.totalLiquidado).toBe('550.00');
  });

  it('por km: queda la regla por km y la otra regla BASE deja de aplicar', () => {
    const r = calculate(input({ rules: [porKm(), fija()], baseOverride: { method: 'PER_KM' } }));
    expect(r.totalLiquidado).toBe('450.00'); // 180 km × 2.50
    expect(r.base?.source).toMatchObject({ kind: 'RULE', ref: 'BASE_KM' });
    expect(r.base?.replaced).toEqual(['BASE_FIJA']);
    expect(r.discarded).toContainEqual(expect.objectContaining({ ruleCode: 'BASE_FIJA', reason: 'BASE_REEMPLAZADA' }));
  });

  it('las demás fases siguen igual', () => {
    const recargo = makeRule({ code: 'RECARGO', stage: 'SURCHARGE', expression: { op: 'FIXED', amount: '10' } });
    const r = calculate(input({ rules: [porKm(), fija(), recargo], baseOverride: { method: 'PER_KM' } }));
    expect(r.stageSubtotals.SURCHARGE).toBe('10.00');
    expect(r.totalLiquidado).toBe('460.00');
  });

  it('no cobra dos veces: una regla por km en otra fase se omite y se informa', () => {
    const variable = makeRule({ code: 'VAR_KM', stage: 'VARIABLE', expression: { op: 'PER_KM', rate: '0.50' } });
    const r = calculate(input({ rules: [porKm(), variable], baseOverride: { method: 'PER_KM' } }));
    expect(r.totalLiquidado).toBe('450.00');
    expect(r.base?.duplicates.map((d) => d.ruleCode)).toEqual(['VAR_KM']);
    expect(r.discarded).toContainEqual(expect.objectContaining({ ruleCode: 'VAR_KM', reason: 'DUPLICA_BASE' }));
    expect(r.warnings.some((w) => w.includes('VAR_KM'))).toBe(true);
  });

  it('un recargo fijo no es duplicado de una base fija', () => {
    const recargo = makeRule({ code: 'RECARGO', stage: 'SURCHARGE', expression: { op: 'FIXED', amount: '10' } });
    const r = calculate(input({ rules: [fija(), recargo], baseOverride: { method: 'FIXED' } }));
    expect(r.base?.duplicates).toEqual([]);
    expect(r.totalLiquidado).toBe('110.00');
  });

  it('por unidad no choca con una regla por km de otra fase', () => {
    const porParada = makeRule({
      code: 'BASE_PARADA', stage: 'BASE', expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '3' },
    });
    const variable = makeRule({ code: 'VAR_KM', stage: 'VARIABLE', expression: { op: 'PER_KM', rate: '0.50' } });
    const r = calculate(input({ rules: [porParada, variable], baseOverride: { method: 'PER_UNIT' } }));
    expect(r.base?.duplicates).toEqual([]);
    expect(r.totalLiquidado).toBe('210.00'); // 40 paradas × 3 + 180 km × 0.50
  });
});

describe('reglas alternativas que hoy pierden por exclusividad', () => {
  const porDefecto = porKm('2.50', { stacking: 'EXCLUSIVE', priority: 1 });
  const porVolumen = makeRule({
    code: 'BASE_VOLUMEN', name: 'Base por volumen', stage: 'BASE', stacking: 'EXCLUSIVE', priority: 5,
    expression: { op: 'PER_UNIT', unit: 'truckVolumeM3', rate: '10' },
  });
  const viaje = { trip: makeTrip({ truckVolumeM3: 20 }) };

  it('quedan disponibles aunque la base por defecto gane', () => {
    const lista = listBaseMethods(input({ ...viaje, rules: [porDefecto, porVolumen] }));
    expect(metodo(lista, 'VOLUME')).toMatchObject({ available: true, source: { ref: 'BASE_VOLUMEN' } });
    // Por defecto sigue ganando la de km.
    expect(calculate(input({ ...viaje, rules: [porDefecto, porVolumen] })).totalLiquidado).toBe('450.00');
  });

  it('al elegirlas pasan a ser la base y la de km deja de aplicar', () => {
    const r = calculate(input({ ...viaje, rules: [porDefecto, porVolumen], baseOverride: { method: 'VOLUME' } }));
    expect(r.totalLiquidado).toBe('200.00'); // 20 m³ × 10
    expect(r.base?.replaced).toEqual(['BASE_KM']);
  });

  it('entre dos EXCLUSIVE del mismo tipo gana la de mayor precedencia', () => {
    const otraKm = porKm('9.99', { code: 'BASE_KM_ALT', stacking: 'EXCLUSIVE', priority: 3 });
    const r = calculate(input({ rules: [porDefecto, otraKm], baseOverride: { method: 'PER_KM' } }));
    expect(r.totalLiquidado).toBe('450.00');
  });
});

describe('flota propia: la base sale de la estructura de costos', () => {
  const propia = (over: Partial<CalculateInput> = {}) => input({
    trip: makeTrip({ fleetType: 'OWN', km: 180 }),
    ...makeOwnCostStructure({ costPerKm: '5', depreciationPerKm: '0', driverDaily: '35' }),
    ...over,
  });

  it('por defecto suma todos los gastos de la estructura', () => {
    expect(calculate(propia()).totalLiquidado).toBe('935.00'); // 180 × 5 + 1 día × 35
  });

  it('por km: {km} × {costo} = resultado, y se dice que sale de la estructura', () => {
    const r = calculate(propia({ baseOverride: { method: 'PER_KM' } }));
    expect(r.totalLiquidado).toBe('900.00');
    const linea = r.trace.find((l) => l.stage === 'BASE')!;
    expect(linea.inputs).toMatchObject({ km: 180, 'costo por km': '5.0000' });
    expect(r.base?.source.kind).toBe('COST_STRUCTURE');
    expect(r.base?.replaced).toContain('ESTRUCTURA_COSTOS');
    // El costo real del viaje (para el margen de auditoría) no se toca.
    expect(r.cost.total).toBe(calculate(propia()).cost.total);
  });

  it('una regla por km en otra fase se omite: la estructura ya cobra por km', () => {
    const variable = makeRule({ code: 'VAR_KM', stage: 'VARIABLE', expression: { op: 'PER_KM', rate: '0.50' } });
    const r = calculate(propia({ rules: [variable], baseOverride: { method: 'PER_KM' } }));
    expect(r.totalLiquidado).toBe('900.00');
    expect(r.base?.duplicates.map((d) => d.ruleCode)).toEqual(['VAR_KM']);
  });
});

describe('un tipo sin información no cambia nada y frena la emisión', () => {
  it('tendering: el total es el de siempre y hay un problema bloqueante', () => {
    const reglas = [porKm()];
    const normal = calculate(input({ rules: reglas }));
    const r = calculate(input({ rules: reglas, baseOverride: { method: 'TENDERING' } }));
    expect(r.totalLiquidado).toBe(normal.totalLiquidado);
    expect(r.base).toBeUndefined();
    expect(r.blockingIssues).toContainEqual(expect.objectContaining({ code: 'BASE_NO_DISPONIBLE' }));
  });

  it('volumen sin reglas ni datos', () => {
    const r = calculate(input({ rules: [porKm()], baseOverride: { method: 'VOLUME' } }));
    expect(r.blockingIssues[0]?.message).toContain('Por volumen');
  });
});

describe('textos de procedencia', () => {
  it('dice en qué se basa la base elegida', () => {
    expect(sourceSentence({ kind: 'COST_STRUCTURE', ref: 'x', label: 'Estructura de costos de la compañía' }))
      .toBe('Este cálculo está basado en la estructura de costos de la compañía.');
    expect(sourceSentence({ kind: 'RATE_TABLE', ref: 'ZONAS_VE', label: 'Tarifario ZONAS_VE' }))
      .toBe('Este cálculo está basado en el tarifario ZONAS_VE.');
    expect(sourceSentence({ kind: 'RULE', ref: 'BASE_KM', label: 'Regla Base por km' }))
      .toBe('Este cálculo está basado en la regla Base por km.');
  });

  it('describe la base actual sin cambio y con cambio', () => {
    const sin = calculate(input({ rules: [porKm()] }));
    expect(describeCurrentBase(sin)).toEqual({ label: 'Regla Base por km', changed: false });
    const con = calculate(input({ rules: [porKm()], baseOverride: { method: 'PER_KM' } }));
    expect(describeCurrentBase(con)).toEqual({ label: 'Regla Base por km', changed: true });
  });
});
