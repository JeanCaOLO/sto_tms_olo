// F1 de la revisión del motor (2026-10-15): correctitud de dinero.
//   A1: el total recalculado al destildar no coincidía con el del motor (redondeo por línea vs una vez).
//   A2: un dato no numérico abortaba la liquidación entera en vez de avisar y valer 0.

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
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
