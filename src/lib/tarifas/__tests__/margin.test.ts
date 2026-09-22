import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { computeMargin } from '../margin';
import {
  makeCountryVE, makeGeoVE, makeMarginPolicy, makeOutsourcedCostRate, makeOwnCostParams,
  makeRequirementRules, makeTrip,
} from './fixtures';

describe('computeMargin', () => {
  it('9. margen negativo da estado LOSS y acción BLOCK cuando blockOnLoss', () => {
    const country = makeCountryVE();
    const policy = makeMarginPolicy({ blockOnLoss: true });

    const result = computeMargin(new Decimal('100.00'), new Decimal('150.00'), policy, country);

    expect(result.amount).toBe('-50.00');
    expect(result.status).toBe('LOSS');
    expect(result.action).toBe('BLOCK');
  });

  it('margen negativo sin blockOnLoss da LOSS pero no bloquea', () => {
    const country = makeCountryVE();
    const policy = makeMarginPolicy({ blockOnLoss: false });

    const result = computeMargin(new Decimal('100.00'), new Decimal('150.00'), policy, country);

    expect(result.status).toBe('LOSS');
    expect(result.action).not.toBe('BLOCK');
  });
});

describe('calculate() — caso B\' del requerimiento (override + outsourcing)', () => {
  it('2. override de R1 a 360.00 da 470.00 liquidado, margen 10.64% y estado WARN', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip({ fleetType: 'OUTSOURCED', carrierId: 'CARRIER_1', truckTypeId: 'TT_350' });
    const rules = makeRequirementRules();

    const result = calculate({
      country,
      trip,
      rules,
      zones,
      zoneGroups,
      locations,
      zoneLaneRates: [],
      fxRates: [],
      ownCostParams: makeOwnCostParams(),
      outsourcedCostRates: [makeOutsourcedCostRate()], // flatRate 420.00
      marginPolicy: makeMarginPolicy(),
      overrides: { R1: { value: '360.00', reason: 'Descuento comercial autorizado' } },
    });

    expect(result.totalLiquidado).toBe('470.00');
    expect(result.cost.total).toBe('420.00');
    expect(result.margin.amount).toBe('50.00');
    expect(result.margin.pct).toBe('0.1064');
    expect(result.margin.status).toBe('WARN');
    expect(result.margin.action).toBe('REQUIRE_REASON');
  });

  it('caso base (sin override, flota propia) da margen OK', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip({ fleetType: 'OWN' });
    const rules = makeRequirementRules();

    const result = calculate({
      country,
      trip,
      rules,
      zones,
      zoneGroups,
      locations,
      zoneLaneRates: [],
      fxRates: [],
      ownCostParams: makeOwnCostParams(),
      outsourcedCostRates: [],
      marginPolicy: makeMarginPolicy(),
    });

    expect(result.totalLiquidado).toBe('510.00');
    expect(result.cost.total).toBe('265.40'); // 180*1.10 + 180*0.18 + 1*35.00
    expect(result.margin.amount).toBe('244.60');
    expect(result.margin.pct).toBe('0.4796');
    expect(result.margin.status).toBe('OK');
    expect(result.margin.action).toBe('NONE');
  });
});
