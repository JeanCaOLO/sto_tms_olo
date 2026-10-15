// Ajustes ligados a una forma de cobro: solo aplican cuando la base del viaje es una de ellas.

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { activeBaseMethod, filterByBaseMethod } from '../baseInheritance';
import { RuleSchema } from '../schemas';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, Rule } from '../types';

const input = (over: Partial<CalculateInput> = {}): CalculateInput => ({
  country: makeCountryVE(),
  trip: makeTrip(),
  rules: [],
  ...makeGeoVE(),
  marginPolicy: makeMarginPolicy(),
  ...over,
});

const sobreKm = (over: Partial<Rule> = {}) =>
  makeRule({ code: 'SOBRE_KM', stage: 'SURCHARGE', expression: { op: 'PER_KM', rate: '0.50' }, ...over });

describe('activeBaseMethod', () => {
  it('flota propia = por km; tercero = la del catálogo; sin catálogo = ninguna', () => {
    expect(activeBaseMethod('OWN', undefined)).toBe('PER_KM');
    expect(activeBaseMethod('OWN', 'FIXED')).toBe('PER_KM');
    expect(activeBaseMethod('OUTSOURCED', 'FIXED')).toBe('FIXED');
    expect(activeBaseMethod('OUTSOURCED', undefined)).toBeNull();
  });
});

describe('filterByBaseMethod', () => {
  it('transversal (null o vacío) aplica siempre', () => {
    const reglas = [sobreKm(), sobreKm({ code: 'B', appliesToBase: [] }), sobreKm({ code: 'C', appliesToBase: null })];
    expect(filterByBaseMethod(reglas, 'FIXED')).toEqual({ rules: reglas, discarded: [] });
  });

  it('ligada a otra modalidad se descarta con MODALIDAD_DISTINTA y el detalle', () => {
    const r = filterByBaseMethod([sobreKm({ appliesToBase: ['PER_KM'] })], 'FIXED');
    expect(r.rules).toEqual([]);
    expect(r.discarded).toEqual([{
      ruleCode: 'SOBRE_KM',
      reason: 'MODALIDAD_DISTINTA',
      detail: 'Aplica solo a base por kilómetro; este viaje se cobra por tarifa fija.',
    }]);
  });

  it('ligada a la modalidad activa (o a una de varias) se conserva', () => {
    const regla = sobreKm({ appliesToBase: ['FIXED', 'VOLUME'] });
    expect(filterByBaseMethod([regla], 'FIXED').rules).toEqual([regla]);
  });

  it('sin modalidad activa no descarta nada, y las BASE nunca se filtran', () => {
    const ligada = sobreKm({ appliesToBase: ['PER_KM'] });
    expect(filterByBaseMethod([ligada], null).rules).toEqual([ligada]);
    const base = makeRule({ code: 'B', stage: 'BASE', appliesToBase: ['PER_KM'], expression: { op: 'FIXED', amount: '1' } });
    expect(filterByBaseMethod([base], 'FIXED').rules).toEqual([base]);
  });
});

describe('en el cálculo', () => {
  it('tercero con tarifa fija: el recargo ligado a km se descarta; el transversal aplica', () => {
    const ligada = sobreKm({ appliesToBase: ['PER_KM'] });
    const libre = makeRule({ code: 'LIBRE', stage: 'SURCHARGE', expression: { op: 'FIXED', amount: '10' } });
    const r = calculate(input({ rules: [ligada, libre], baseOverride: { method: 'FIXED', amount: '1000' } }));
    expect(r.discarded).toContainEqual(expect.objectContaining({ ruleCode: 'SOBRE_KM', reason: 'MODALIDAD_DISTINTA' }));
    expect(r.totalLiquidado).toBe('1010.00');
  });

  it('tercero con base por km: el recargo ligado a km aplica', () => {
    const base = makeRule({ code: 'BASE_KM', stage: 'BASE', expression: { op: 'PER_KM', rate: '2' } });
    const r = calculate(input({
      rules: [base, makeRule({ code: 'AJUSTE', stage: 'SURCHARGE', appliesToBase: ['PER_KM'], expression: { op: 'FIXED', amount: '5' } })],
      baseOverride: { method: 'PER_KM' },
    }));
    expect(r.discarded.map((d) => d.reason)).not.toContain('MODALIDAD_DISTINTA');
    expect(r.totalLiquidado).toBe('365.00'); // 180 × 2 + 5
  });

  it('flota propia cuenta como por km', () => {
    const own = input({
      trip: makeTrip({ fleetType: 'OWN', km: 180 }),
      ...makeOwnCostStructure({ costPerKm: '5', depreciationPerKm: '0', driverDaily: '35' }),
    });
    const ligadaFija = makeRule({ code: 'SOLO_FIJA', stage: 'SURCHARGE', appliesToBase: ['FIXED'], expression: { op: 'FIXED', amount: '99' } });
    const ligadaKm = makeRule({ code: 'SOLO_KM', stage: 'SURCHARGE', appliesToBase: ['PER_KM'], expression: { op: 'FIXED', amount: '1' } });
    const r = calculate({ ...own, rules: [ligadaFija, ligadaKm] });
    expect(r.discarded.map((d) => [d.ruleCode, d.reason])).toContainEqual(['SOLO_FIJA', 'MODALIDAD_DISTINTA']);
    expect(r.totalLiquidado).toBe('936.00'); // 935 de la estructura + 1
  });

  it('sin ligar nada el resultado es el de siempre', () => {
    const regla = makeRule({ code: 'X', stage: 'SURCHARGE', expression: { op: 'FIXED', amount: '10' } });
    const a = calculate(input({ rules: [regla], baseOverride: { method: 'FIXED', amount: '100' } }));
    expect(a.totalLiquidado).toBe('110.00');
    expect(a.discarded).toEqual([]);
  });
});

describe('esquema', () => {
  const base = { ...sobreKm(), id: 'r1', countryId: 'VE' };
  it('acepta modalidades válidas y rechaza desconocidas', () => {
    expect(RuleSchema.safeParse({ ...base, appliesToBase: ['PER_KM', 'FIXED'] }).success).toBe(true);
    expect(RuleSchema.safeParse({ ...base, appliesToBase: null }).success).toBe(true);
    expect(RuleSchema.safeParse({ ...base, appliesToBase: ['OTRA'] }).success).toBe(false);
  });
});
