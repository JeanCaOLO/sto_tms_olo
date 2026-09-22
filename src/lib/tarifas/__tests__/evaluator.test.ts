// Puerto literal de vista-tarifas-fase1/src/kernel/__tests__/evaluator.test.ts.
import { describe, expect, it } from 'vitest';
import { deriveContext, resolveRules } from '../resolver';
import { evaluateExpr, runChargePipeline } from '../evaluator';
import {
  makeCountryVE, makeEvalContext, makeGeoVE, makeRequirementRules, makeRule, makeTrip,
} from './fixtures';

describe('runChargePipeline â€” caso del requerimiento', () => {
  it('1. Caracas â†’ Carabobo, 180km, 40 clientes, EXPRESS da exactamente 510.00', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip();
    const rules = makeRequirementRules();

    const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
    const { applied, discarded } = resolveRules(
      { trip, country, rules, zones, zoneGroups, locations, zoneLaneRates: [] },
      derived,
    );
    const result = runChargePipeline(applied, derived.vars, derived.originZoneId, derived.destZoneId, {
      country, trip, zoneLaneRates: [], fxRates: [],
    });

    expect(result.totalLiquidado).toBe('510.00');
    expect(discarded).toEqual([]);
    expect(result.trace.map((l) => l.ruleCode)).toEqual(['R1', 'R2', 'R3']);
  });

  it('2. Un override de R1 a 360.00 da 470.00', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip();
    const rules = makeRequirementRules();

    const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
    const { applied } = resolveRules(
      { trip, country, rules, zones, zoneGroups, locations, zoneLaneRates: [] },
      derived,
    );
    const result = runChargePipeline(applied, derived.vars, derived.originZoneId, derived.destZoneId, {
      country, trip, zoneLaneRates: [], fxRates: [],
      overrides: { R1: { value: '360.00', reason: 'Descuento comercial autorizado' } },
    });

    expect(result.totalLiquidado).toBe('470.00');
    const r1Line = result.trace.find((l) => l.ruleCode === 'R1');
    expect(r1Line?.override).toEqual({ value: '360.00', reason: 'Descuento comercial autorizado' });
    expect(r1Line?.computedRef).toBe('400.00'); // el valor calculado por la regla se conserva
    expect(r1Line?.final).toBe('360.00');
  });
});

describe('PERCENT â€” la base importa', () => {
  it('3. RUNNING_SUBTOTAL y STAGE_SUBTOTAL dan resultados distintos y correctos', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip();

    const base = makeRule({ code: 'BASE1', stage: 'BASE', priority: 10, expression: { op: 'FIXED', amount: '100.00' } });
    const variable = makeRule({
      code: 'VAR1', stage: 'VARIABLE', priority: 10, expression: { op: 'FIXED', amount: '50.00' },
    });
    // Al momento de evaluarse (etapa ADJUSTMENT), running = 100 + 50 = 150.
    const pctRunning = makeRule({
      code: 'PCT_RUNNING', stage: 'ADJUSTMENT', priority: 10,
      expression: { op: 'PERCENT', pct: '0.10', base: { of: 'RUNNING_SUBTOTAL' } },
    });
    // BASE ya cerrÃ³ en 100 antes de llegar a ADJUSTMENT, sin importar VARIABLE.
    const pctStage = makeRule({
      code: 'PCT_STAGE', stage: 'ADJUSTMENT', priority: 20,
      expression: { op: 'PERCENT', pct: '0.10', base: { of: 'STAGE_SUBTOTAL', stage: 'BASE' } },
    });

    const rules = [base, variable, pctRunning, pctStage];
    const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
    const { applied } = resolveRules(
      { trip, country, rules, zones, zoneGroups, locations, zoneLaneRates: [] },
      derived,
    );
    const result = runChargePipeline(applied, derived.vars, derived.originZoneId, derived.destZoneId, {
      country, trip, zoneLaneRates: [], fxRates: [],
    });

    const running = result.trace.find((l) => l.ruleCode === 'PCT_RUNNING');
    const stage = result.trace.find((l) => l.ruleCode === 'PCT_STAGE');
    expect(running?.final).toBe('15.00'); // 10% de 150 (100 + 50, ya acumulado antes de esta lÃ­nea)
    expect(stage?.final).toBe('10.00'); // 10% de 100 (solo el subtotal ya cerrado de BASE)
  });
});

describe('LOOKUP_ZONE â€” respaldo cuando no hay cobertura', () => {
  it('cae al fallback PER_KM y emite un warning cuando no hay ZoneLaneRate para el par', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip({ km: 100 });

    const rule = makeRule({
      code: 'ZONE_LOOKUP', stage: 'BASE', priority: 10,
      expression: { op: 'LOOKUP_ZONE', fallback: { op: 'PER_KM', rate: '1.50' } },
    });

    const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
    const { applied } = resolveRules(
      { trip, country, rules: [rule], zones, zoneGroups, locations, zoneLaneRates: [] },
      derived,
    );
    const result = runChargePipeline(applied, derived.vars, derived.originZoneId, derived.destZoneId, {
      country, trip, zoneLaneRates: [], fxRates: [],
    });

    expect(result.trace[0]?.final).toBe('150.00'); // 100km * 1.50
    expect(result.warnings.some((w) => w.includes('Sin cobertura de zona'))).toBe(true);
  });
});

describe('TIERED â€” bordes de escalÃ³n', () => {
  const tiers = [
    { upTo: 15, amount: '0.00' },
    { upTo: 30, amount: '-10.00' },
    { upTo: null, amount: '-25.00' },
  ];

  it('7. evalÃºa el escalÃ³n correcto exactamente en el borde y justo despuÃ©s', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const expr = { op: 'TIERED' as const, unit: 'lateMinutes' as const, tiers };

    const atBorder = deriveContext({ trip: makeTrip({ lateMinutes: 15 }), country, zones, zoneGroups, locations });
    const justAfter = deriveContext({ trip: makeTrip({ lateMinutes: 16 }), country, zones, zoneGroups, locations });
    const secondBorder = deriveContext({ trip: makeTrip({ lateMinutes: 30 }), country, zones, zoneGroups, locations });
    const beyondAll = deriveContext({ trip: makeTrip({ lateMinutes: 31 }), country, zones, zoneGroups, locations });

    expect(evaluateExpr(expr, makeEvalContext(atBorder.vars)).toFixed(2)).toBe('0.00');
    expect(evaluateExpr(expr, makeEvalContext(justAfter.vars)).toFixed(2)).toBe('-10.00');
    expect(evaluateExpr(expr, makeEvalContext(secondBorder.vars)).toFixed(2)).toBe('-10.00');
    expect(evaluateExpr(expr, makeEvalContext(beyondAll.vars)).toFixed(2)).toBe('-25.00');
  });
});

describe('Redondeo â€” un solo punto', () => {
  it('8. la suma de lÃ­neas redondeadas individualmente no altera el total redondeado', () => {
    const country = makeCountryVE(); // HALF_UP, 2 decimales
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip();

    // Cada lÃ­nea, redondeada de forma aislada (HALF_UP), da 1.01 (1.005 -> 1.01). Sumadas asÃ­,
    // darÃ­an 2.02. Pero el total real se calcula sobre el Decimal exacto (1.005 + 1.005 = 2.010)
    // y ESE es el que se redondea: 2.01, no 2.02.
    const lineA = makeRule({ code: 'A', stage: 'BASE', priority: 10, expression: { op: 'FIXED', amount: '1.005' } });
    const lineB = makeRule({ code: 'B', stage: 'BASE', priority: 20, expression: { op: 'FIXED', amount: '1.005' } });

    const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
    const { applied } = resolveRules(
      { trip, country, rules: [lineA, lineB], zones, zoneGroups, locations, zoneLaneRates: [] },
      derived,
    );
    const result = runChargePipeline(applied, derived.vars, derived.originZoneId, derived.destZoneId, {
      country, trip, zoneLaneRates: [], fxRates: [],
    });

    expect(result.trace.map((l) => l.final)).toEqual(['1.01', '1.01']); // cada lÃ­nea, mostrada redondeada
    expect(result.totalLiquidado).toBe('2.01'); // pero el total real no es 1.01 + 1.01
  });
});
