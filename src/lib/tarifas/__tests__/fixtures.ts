// Fixtures mínimos y reusables para los tests del kernel.
// Puerto literal de vista-tarifas-fase1/src/kernel/__tests__/fixtures.ts.

import Decimal from 'decimal.js';
import type { EvalContext } from '../evaluator';
import type {
  Country, Location, MarginPolicy, OutsourcedCostRate, OwnCostParams, Rule, TripContext, VarBag,
  Zone, ZoneGroup,
} from '../types';

// Contexto de evaluación mínimo para probar evaluateExpr en aislamiento, sin correr todo el pipeline.
export function makeEvalContext(vars: VarBag, overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    vars,
    originZoneId: 'Z_CCS',
    destZoneId: 'Z_CAR',
    zoneLaneRates: [],
    getStageSubtotal: () => new Decimal(0),
    getRunningSubtotal: () => new Decimal(0),
    getRuleAmount: () => null,
    warn: () => {},
    ...overrides,
  };
}

export function makeCountryVE(): Country {
  return {
    id: 'VE',
    iso2: 'VE',
    name: 'Venezuela',
    localCurrency: 'VES',
    refCurrency: 'USD',
    roundingDecimals: 2,
    roundingMode: 'HALF_UP',
    overnightThresholdHours: 24,
  };
}

export function makeGeoVE(): { zoneGroups: ZoneGroup[]; zones: Zone[]; locations: Location[] } {
  const zoneGroups: ZoneGroup[] = [
    { id: 'ZG_CENTRO', countryId: 'VE', code: 'CENTRO', name: 'Centro' },
  ];
  const zones: Zone[] = [
    { id: 'Z_CCS', countryId: 'VE', zoneGroupId: 'ZG_CENTRO', code: 'CCS', name: 'Caracas' },
    { id: 'Z_CAR', countryId: 'VE', zoneGroupId: 'ZG_CENTRO', code: 'CAR', name: 'Carabobo' },
  ];
  const locations: Location[] = [
    { id: 'L_CCS_1', countryId: 'VE', zoneId: 'Z_CCS', code: 'CCS-01', name: 'Caracas Centro' },
    { id: 'L_CAR_1', countryId: 'VE', zoneId: 'Z_CAR', code: 'CAR-01', name: 'Valencia' },
  ];
  return { zoneGroups, zones, locations };
}

export function makeTrip(overrides: Partial<TripContext> = {}): TripContext {
  return {
    countryId: 'VE',
    quotedAt: '2026-07-31T10:00:00.000Z',
    originLocationId: 'L_CCS_1',
    destLocationId: 'L_CAR_1',
    km: 180,
    clientCount: 40,
    packageCount: 40,
    weightKg: 1200,
    truckTypeId: 'TT_350',
    serviceType: 'EXPRESS',
    fleetType: 'OWN',
    carrierId: null,
    driverId: null,
    customerId: null,
    durationHours: 3,
    tollsAmount: '0.00',
    lateMinutes: 0,
    incidentCount: 0,
    ...overrides,
  };
}

let ruleSeq = 0;

export function makeRule(overrides: Partial<Rule> & Pick<Rule, 'stage' | 'expression'>): Rule {
  ruleSeq += 1;
  return {
    id: `rule-${ruleSeq}`,
    countryId: 'VE',
    code: `R${ruleSeq}`,
    name: `Regla ${ruleSeq}`,
    priority: 10,
    stacking: 'SUM',
    exclusionGroup: null,
    currencyMode: 'REF',
    conditions: { p: 'ALWAYS' },
    isAdhoc: false,
    active: true,
    version: 1,
    ...overrides,
  };
}

export function makeOwnCostParams(overrides: Partial<OwnCostParams> = {}): OwnCostParams {
  return {
    id: 'OWN_VE',
    countryId: 'VE',
    costPerKm: '1.10',
    depreciationPerKm: '0.18',
    driverDaily: '35.00',
    ...overrides,
  };
}

export function makeOutsourcedCostRate(overrides: Partial<OutsourcedCostRate> = {}): OutsourcedCostRate {
  return {
    id: 'OSR_1',
    countryId: 'VE',
    carrierId: 'CARRIER_1',
    truckTypeId: 'TT_350',
    flatRate: '420.00',
    ...overrides,
  };
}

export function makeMarginPolicy(overrides: Partial<MarginPolicy> = {}): MarginPolicy {
  return {
    countryId: 'VE',
    warnBelow: 0.15,
    criticalBelow: 0.1,
    requireReasonBelow: 0.15,
    blockOnLoss: true,
    ...overrides,
  };
}

// Las tres reglas exactas del requerimiento (prompt maestro, sección 9).
export function makeRequirementRules(): Rule[] {
  const r1 = makeRule({
    code: 'R1',
    stage: 'BASE',
    priority: 10,
    stacking: 'EXCLUSIVE',
    conditions: {
      p: 'AND',
      args: [
        { p: 'EQ', left: 'originZone', right: 'CCS' },
        { p: 'EQ', left: 'destZone', right: 'CAR' },
      ],
    },
    expression: { op: 'FIXED', amount: '400.00' },
  });
  const r2 = makeRule({
    code: 'R2',
    stage: 'VARIABLE',
    priority: 20,
    stacking: 'SUM',
    conditions: { p: 'GT', left: 'clientCount', right: 0 },
    expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '2.00' },
  });
  const r3 = makeRule({
    code: 'R3',
    stage: 'MODIFIER',
    priority: 30,
    stacking: 'SUM',
    conditions: { p: 'EQ', left: 'serviceType', right: 'EXPRESS' },
    expression: { op: 'FIXED', amount: '30.00' },
  });
  return [r1, r2, r3];
}
