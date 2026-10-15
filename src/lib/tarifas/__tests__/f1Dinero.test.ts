// F1 de la revisión del motor (2026-10-15): correctitud de dinero.
//   A1: el total recalculado al destildar no coincidía con el del motor (redondeo por línea vs una vez).
//   A2: un dato no numérico abortaba la liquidación entera en vez de avisar y valer 0.

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { structureCostPerKm } from '../baseMethods';
import { parseParams } from '../cost-template/param-parsing';
import { computeCost } from '../cost';
import { deriveContext } from '../resolver';
import { evaluateExpr } from '../evaluator';
import { unitsForDriver } from '../cost/driver';
import { computeSettlementTotals, differsFromEngine } from '../settlementTotals';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, VarBag } from '../types';
import type { EvalContext } from '../evaluator/expressions';
import { parseAmount } from '../cost-sheet-parser/utils';
import { fuelEfficiencyFor, sameTruckType } from '../cost/shared';
import Decimal from 'decimal.js';

const PAIS = makeCountryVE();

function input(rules: CalculateInput['rules']): CalculateInput {
  const { zoneGroups, zones, locations } = makeGeoVE();
  return {
    country: PAIS, trip: makeTrip(), rules, zones, zoneGroups, locations,
    ...makeOwnCostStructure(), marginPolicy: makeMarginPolicy(),
  };
}

function ctx(vars: Record<string, unknown>, warnings: string[] = []): EvalContext {
  return {
    vars: vars as VarBag, originZoneId: 'o', destZoneId: 'd',
    getStageSubtotal: () => new Decimal(0), getRunningSubtotal: () => new Decimal(0),
    getRuleAmount: () => null, warn: (m) => warnings.push(m),
  };
}

describe('A1 — total recalculado vs total del motor', () => {
  // Tres reglas de 0.004: el motor suma exacto (0.012 → 0.01); cada línea sola redondea a 0.00.
  const r = (code: string) => makeRule({ code, stage: 'SURCHARGE', expression: { op: 'FIXED', amount: '0.004' } });

  it('sin destildar, el total mostrado es EXACTAMENTE el del motor', () => {
    const result = calculate(input([r('A'), r('B'), r('C')]));
    const totals = computeSettlementTotals(result.trace, [], PAIS, result);
    expect(totals.total).toBe(result.totalLiquidado);
    expect(totals.stageSubtotals).toEqual(result.stageSubtotals);
    expect(differsFromEngine(totals, result)).toBe(false);
  });

  it('differsFromEngine no da falso positivo al destildar una línea de importe cero', () => {
    const result = calculate(input([r('A'), r('B'), r('C'), makeRule({ code: 'Z', stage: 'SURCHARGE', expression: { op: 'FIXED', amount: '0' } })]));
    const z = result.trace.find((l) => l.ruleCode === 'Z');
    const totals = computeSettlementTotals(result.trace, z ? [z.seq] : [], PAIS, result);
    expect(differsFromEngine(totals, result)).toBe(false);
  });
});

describe('A1 — costo de flota propia', () => {
  it('cost.total coincide con la suma de sus líneas redondeadas', () => {
    const result = calculate(input([]));
    const suma = result.cost.breakdown.reduce((s, l) => s.plus(l.final), new Decimal(0));
    expect(result.cost.total).toBe(suma.toFixed(PAIS.roundingDecimals));
  });
});

describe('A8 — fijo mensual: una sola definición (prorrateo por día)', () => {
  it('costo/km de la estructura × km del viaje == costo del viaje (fijo mensual + por km)', () => {
    const estructura = {
      id: 'S', partyId: 'P1', countryId: 'VE', name: 'S', operatingDaysPerMonth: 30,
      params: { kmPerYear: 36000, fuelPrice: null, fuelEfficiency: {} },
      effectiveFrom: null, active: true, notes: null,
    };
    const fila = (code: string, driver: 'PER_KM' | 'PER_MONTH_PRORATED', amount: string, order: number) => ({
      id: code, structureId: 'S', code, label: code, driver, amount, sign: 'ADD' as const, appliesWhen: null,
      unit: null, order, active: true, group: null, frequency: null, frequencyQty: null,
      unitQty: null, costPerKm: null, truckType: null,
    });
    const rows = [fila('SALARIO', 'PER_MONTH_PRORATED', '900000', 1), fila('LLANTAS', 'PER_KM', '12.5', 2)];
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip({ fleetType: 'OWN', km: 180 });
    const { vars, overnightNights } = deriveContext({ trip, country, zones, zoneGroups, locations });
    const input = { country, trip, ...makeOwnCostStructure(), costStructure: estructura, costStructureRows: rows };

    const cost = computeCost(input, overnightNights, vars);
    const perKm = structureCostPerKm(input, vars)!.perKm;
    const porKm = perKm.times(180);
    // La base por km reproduce el costo del viaje (a la tolerancia del redondeo de líneas).
    expect(Math.abs(Number(cost.total) - porKm.toNumber())).toBeLessThan(0.05);
  });
});

describe('plantilla de costos — alias de claves de parámetros', () => {
  const params = (...claves: string[]) =>
    parseParams({
      Parámetros: [['clave', 'valor'], ...claves.map((c, i) => [c, String(30 + i)])],
    });

  it.each([
    ['km_anual'], ['km anual'], ['KM_POR_ANIO'], ['Km por año'], ['km-anual'],
  ])('"%s" es el km anual', (clave) => {
    const r = params('dias_operativos', clave);
    expect(r.warnings.filter((w) => w.message.includes('desconocido'))).toEqual([]);
    expect(r.params.kmPerYear).toBe(31);
  });

  it('precio del combustible con sinónimos', () => {
    expect(params('dias_operativos', 'Precio del combustible').params.fuelPrice).toBe('31');
  });

  it('una clave desconocida sigue avisando', () => {
    const r = params('dias_operativos', 'otra_cosa');
    expect(r.warnings.some((w) => w.message.includes('desconocido'))).toBe(true);
  });
});

describe('A7 — parseAmount', () => {
  it('varios puntos sin coma son separadores de miles', () => {
    expect(parseAmount('1.234.567')).toBe('1234567');
    expect(parseAmount('1.234,5')).toBe('1234.5');
  });
  it('un punto único con formato "es" explícito se lee como miles', () => {
    expect(parseAmount('1.234', 'es')).toBe('1234');
  });
});

describe('M6 — tipo de camión sin distinguir acentos ni mayúsculas', () => {
  it('sameTruckType y fuelEfficiencyFor', () => {
    expect(sameTruckType('Camión Mediano', 'camion mediano')).toBe(true);
    expect(sameTruckType('Camión Mediano', 'camion grande')).toBe(false);
    expect(fuelEfficiencyFor({ 'Camión Mediano': '5' }, 'camion mediano')).toBe('5');
    expect(fuelEfficiencyFor({ NPR: '6' }, 'NPR')).toBe('6');
    expect(fuelEfficiencyFor({ NPR: '6' }, null)).toBeUndefined();
  });
});

describe('A2 — datos no numéricos no abortan el cálculo', () => {
  it('PER_UNIT con variable de texto avisa y vale 0', () => {
    const w: string[] = [];
    expect(evaluateExpr({ op: 'PER_UNIT', unit: 'weightKg', rate: '2' }, ctx({ weightKg: 'abc' }, w)).toString()).toBe('0');
    expect(w.some((m) => m.includes('weightKg'))).toBe(true);
  });

  it('PER_BLOCK con blockSize 0 es una regla ilegible (no un throw genérico)', () => {
    const result = calculate(input([
      makeRule({ code: 'PB', stage: 'SURCHARGE', expression: { op: 'PER_BLOCK', unit: 'km', blockSize: 0, amount: '5' } }),
    ]));
    expect(result.blockingIssues.some((i) => i.code === 'REGLA_ILEGIBLE')).toBe(true);
  });

  it('driver custom con valor vacío o texto avisa y vale 0', () => {
    const w: string[] = [];
    const trip = makeTrip();
    expect(unitsForDriver('custom:peajes', trip, 1, 30, { 'custom:peajes': '' } as unknown as VarBag, (m) => w.push(m)).toString()).toBe('0');
    expect(unitsForDriver('custom:peajes', trip, 1, 30, { 'custom:peajes': 'x' } as unknown as VarBag, (m) => w.push(m)).toString()).toBe('0');
    expect(w).toHaveLength(2);
  });
});
