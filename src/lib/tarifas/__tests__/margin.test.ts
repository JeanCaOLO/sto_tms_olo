// Lo que se liquida y la ganancia/pérdida de auditoría.
//
//   - Flota propia: el total a pagar ES la acumulación de gastos de la estructura de costos (más lo
//     que las reglas ajusten encima).
//   - Terceros: lo que dicen las reglas y los tarifarios.
//   - La ganancia o pérdida compara el valor de la mercancía del viaje con esos gastos, y NUNCA
//     bloquea ni cambia lo que se paga.

import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { computeMargin } from '../margin';
import {
  makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRequirementRules, makeRule, makeTrip,
} from './fixtures';
import type { CargoSummary } from '../types';

const cargo = (value: string): CargoSummary => ({
  value, weightKg: 100, volumeM3: 1, orders: 1,
  parts: [{ customerId: 'C1', code: 'EPA', name: 'EPA', value, weightKg: 100, volumeM3: 1, items: 3, orders: 1 }],
});

describe('computeMargin (auditoría: valor de la mercancía contra gastos)', () => {
  const country = makeCountryVE();
  const policy = makeMarginPolicy();

  it('gastos mayores que el valor transportado dan pérdida', () => {
    const r = computeMargin(new Decimal('100.00'), new Decimal('150.00'), policy, country);
    expect(r).toMatchObject({ amount: '-50.00', status: 'LOSS', basis: 'CARGO', cargoValue: '100.00', expense: '150.00' });
  });

  it('el porcentaje es sobre el valor de la mercancía y los umbrales dan el estado', () => {
    // warnBelow 0.15, criticalBelow 0.10 en el fixture
    expect(computeMargin(new Decimal('1000'), new Decimal('500'), policy, country)).toMatchObject({ pct: '0.5000', status: 'OK' });
    expect(computeMargin(new Decimal('1000'), new Decimal('870'), policy, country)).toMatchObject({ pct: '0.1300', status: 'WARN' });
    expect(computeMargin(new Decimal('1000'), new Decimal('950'), policy, country)).toMatchObject({ pct: '0.0500', status: 'CRITICAL' });
  });

  it('sin valor de mercancía no se inventa un margen', () => {
    const r = computeMargin(new Decimal('0'), new Decimal('150.00'), policy, country);
    expect(r).toMatchObject({ basis: 'NONE', amount: '0.00', status: 'OK', cargoValue: '0.00', expense: '150.00' });
  });

  it('no existe una acción que bloquee o exija motivo', () => {
    const r = computeMargin(new Decimal('100'), new Decimal('900'), makeMarginPolicy({ blockOnLoss: true }), country);
    expect('action' in r).toBe(false);
  });
});

describe('calculate() — flota propia: el total es la acumulación de gastos', () => {
  const { zoneGroups, zones, locations } = makeGeoVE();
  const base = { country: makeCountryVE(), zones, zoneGroups, locations, ...makeOwnCostStructure(), marginPolicy: makeMarginPolicy() };

  it('sin reglas, el total a pagar es exactamente el costo de la estructura', () => {
    const r = calculate({ ...base, trip: makeTrip({ fleetType: 'OWN' }), rules: [] });
    expect(r.cost.total).toBe('265.40'); // 180*1.10 + 180*0.18 + 1*35.00
    expect(r.totalLiquidado).toBe('265.40');
    expect(r.trace.map((l) => l.source)).toEqual(['COST_ROW', 'COST_ROW', 'COST_ROW']);
    expect(r.stageSubtotals.BASE).toBe('265.40');
  });

  it('las reglas activas solo suman o restan encima de los gastos', () => {
    const r = calculate({
      ...base,
      trip: makeTrip({ fleetType: 'OWN' }),
      rules: [makeRule({ code: 'RECOLECTA', stage: 'SURCHARGE', expression: { op: 'FIXED', amount: '30.00' } })],
    });
    expect(r.cost.total).toBe('265.40');
    expect(r.totalLiquidado).toBe('295.40');
    expect(r.trace.at(-1)).toMatchObject({ ruleCode: 'RECOLECTA', source: 'RULE', runningSubtotal: '295.40' });
    expect(r.trace.map((l) => l.seq)).toEqual([1, 2, 3, 4]);
  });

  it('un porcentaje sobre el acumulado ya cuenta los gastos', () => {
    const r = calculate({
      ...base,
      trip: makeTrip({ fleetType: 'OWN' }),
      rules: [makeRule({
        code: 'PCT', stage: 'SURCHARGE',
        expression: { op: 'PERCENT', pct: '0.10', base: { of: 'RUNNING_SUBTOTAL' } },
      })],
    });
    expect(r.totalLiquidado).toBe('291.94'); // 265.40 + 10 %
  });

  it('sin estructura de costos para la flota propia, avisa en vez de liquidar en cero', () => {
    expect(() => calculate({ ...base, defaultCostStructure: null, defaultCostStructureRows: [], trip: makeTrip({ fleetType: 'OWN' }), rules: [] }))
      .toThrow(/estructura de costos/i);
  });

  it('mide la ganancia contra el valor de la mercancía y reparte por casa sin cambiar el total', () => {
    const r = calculate({ ...base, trip: makeTrip({ fleetType: 'OWN' }), rules: [], cargo: cargo('1000.00') });
    expect(r.totalLiquidado).toBe('265.40');
    expect(r.margin).toMatchObject({ basis: 'CARGO', cargoValue: '1000.00', expense: '265.40', amount: '734.60', status: 'OK' });
    expect(r.allocation?.shares).toHaveLength(1);
    expect(r.allocation?.shares[0].amount).toBe('265.40');
  });
});

describe('calculate() — terceros: se paga lo que dicen las reglas', () => {
  it('2. override de R1 a 360.00 da 470.00 liquidado y no usa gastos propios', () => {
    const { zoneGroups, zones, locations } = makeGeoVE();
    const result = calculate({
      country: makeCountryVE(),
      trip: makeTrip({ fleetType: 'OUTSOURCED', carrierId: 'CARRIER_1', truckTypeId: 'TT_350' }),
      rules: makeRequirementRules(),
      zones,
      zoneGroups,
      locations,
      ...makeOwnCostStructure(),
      marginPolicy: makeMarginPolicy(),
      overrides: { R1: { value: '360.00', reason: 'Descuento comercial autorizado' } },
      cargo: cargo('800.00'),
    });

    expect(result.totalLiquidado).toBe('470.00');
    expect(result.cost).toMatchObject({ total: '0.00', modelId: 'NONE', breakdown: [] });
    // Los gastos de un tercero son lo que se le paga.
    expect(result.margin).toMatchObject({ expense: '470.00', amount: '330.00', basis: 'CARGO' });
  });

  it('el caso base de flota propia con reglas de tarifa: 510 de reglas + 265.40 de gastos', () => {
    const { zoneGroups, zones, locations } = makeGeoVE();
    const result = calculate({
      country: makeCountryVE(), trip: makeTrip({ fleetType: 'OWN' }), rules: makeRequirementRules(),
      zones, zoneGroups, locations, ...makeOwnCostStructure(), marginPolicy: makeMarginPolicy(),
    });
    expect(result.totalLiquidado).toBe('775.40');
  });
});
