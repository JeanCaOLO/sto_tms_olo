// Puerto literal de vista-tarifas-fase1/src/kernel/__tests__/resolver.test.ts.
import { describe, expect, it } from 'vitest';
import { deriveContext, resolveRules } from '../resolver';
import { makeCountryVE, makeGeoVE, makeRule, makeTrip } from './fixtures';

describe('resolveRules — stacking', () => {
  it('4. EXCLUSIVE deja pasar solo la regla de menor priority', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip();

    const cheap = makeRule({
      code: 'EXC_LOW',
      stage: 'BASE',
      priority: 10,
      stacking: 'EXCLUSIVE',
      expression: { op: 'FIXED', amount: '100.00' },
    });
    const expensive = makeRule({
      code: 'EXC_HIGH',
      stage: 'BASE',
      priority: 20,
      stacking: 'EXCLUSIVE',
      expression: { op: 'FIXED', amount: '999.00' },
    });

    const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
    const { applied, discarded } = resolveRules(
      { trip, country, rules: [cheap, expensive], zones, zoneGroups, locations, zoneLaneRates: [] },
      derived,
    );

    expect(applied.map((r) => r.code)).toEqual(['EXC_LOW']);
    expect(discarded).toEqual([
      {
        ruleCode: 'EXC_HIGH',
        reason: 'EXCLUDED_BY_EXCLUSIVE',
        detail: 'Excluida por "EXC_LOW" (menor priority en la etapa BASE).',
      },
    ]);
  });

  it('5. MAX: dos reglas del mismo exclusionGroup, gana la de mayor monto', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip();

    const low = makeRule({
      code: 'MAX_LOW',
      stage: 'SURCHARGE',
      priority: 10,
      stacking: 'MAX',
      exclusionGroup: 'promo',
      expression: { op: 'FIXED', amount: '15.00' },
    });
    const high = makeRule({
      code: 'MAX_HIGH',
      stage: 'SURCHARGE',
      priority: 20,
      stacking: 'MAX',
      exclusionGroup: 'promo',
      expression: { op: 'FIXED', amount: '25.00' },
    });

    const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
    const { applied, discarded } = resolveRules(
      { trip, country, rules: [low, high], zones, zoneGroups, locations, zoneLaneRates: [] },
      derived,
    );

    expect(applied.map((r) => r.code)).toEqual(['MAX_HIGH']);
    expect(discarded).toEqual([
      {
        ruleCode: 'MAX_LOW',
        reason: 'LOST_MAX',
        detail: 'Perdió el MAX del grupo "promo" frente a "MAX_HIGH".',
      },
    ]);
  });

  it('una regla inactiva se descarta con motivo INACTIVE', () => {
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const trip = makeTrip();

    const inactive = makeRule({
      code: 'OFF',
      stage: 'BASE',
      active: false,
      expression: { op: 'FIXED', amount: '1.00' },
    });

    const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
    const { applied, discarded } = resolveRules(
      { trip, country, rules: [inactive], zones, zoneGroups, locations, zoneLaneRates: [] },
      derived,
    );

    expect(applied).toEqual([]);
    expect(discarded).toEqual([{ ruleCode: 'OFF', reason: 'INACTIVE', detail: 'La regla está inactiva.' }]);
  });
});

describe('deriveContext — variables derivadas', () => {
  it('10. overnightNights es 0 exactamente en el umbral y 1 justo después', () => {
    const country = makeCountryVE(); // overnightThresholdHours: 24
    const { zoneGroups, zones, locations } = makeGeoVE();

    const atThreshold = deriveContext({
      trip: makeTrip({ durationHours: 24 }),
      country,
      zones,
      zoneGroups,
      locations,
    });
    const justAfter = deriveContext({
      trip: makeTrip({ durationHours: 24.01 }),
      country,
      zones,
      zoneGroups,
      locations,
    });

    expect(atThreshold.vars.overnightNights).toBe(0);
    expect(justAfter.vars.overnightNights).toBe(1);
  });
});
