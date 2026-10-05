// Cada línea del desglose tiene que decir de dónde viene y poder explicarse con SU regla.

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { explainCost, explainResult } from '../explain';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, Rule } from '../types';

function calcular(rules: Rule[], partyId: string | null = 'P1') {
  const { zoneGroups, zones, locations } = makeGeoVE();
  const input: CalculateInput = {
    country: makeCountryVE(),
    trip: makeTrip({ partyId }),
    rules,
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
  };
  return { input, result: calculate(input) };
}

describe('origen de cada línea', () => {
  it('una regla de país queda marcada como RULE / COUNTRY con su versión', () => {
    const { result } = calcular([
      makeRule({ id: 'r-pais', code: 'BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '100.00' }, version: 3 }),
    ]);
    const linea = result.trace[0];
    expect(linea.source).toBe('RULE');
    expect(linea.ruleScope).toBe('COUNTRY');
    expect(linea.ruleVersion).toBe(3);
    expect(linea.rulePartyId).toBeNull();
  });

  it('si la compañía repite el código, la línea es la de la compañía y se explica con SU descripción', () => {
    const porPais = makeRule({
      id: 'r-pais', code: 'BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '100.00' },
      description: 'Tarifa del país',
    });
    const porCompania = makeRule({
      id: 'r-party', code: 'BASE', stage: 'BASE', scope: 'PARTY', partyId: 'P1',
      expression: { op: 'FIXED', amount: '80.00' }, description: 'Tarifa pactada con la compañía',
    });
    const { result } = calcular([porPais, porCompania]);

    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]).toMatchObject({ ruleId: 'r-party', ruleScope: 'PARTY', rulePartyId: 'P1' });
    expect(result.discarded.some((d) => d.reason === 'OVERRIDDEN_BY_PARTY' && d.ruleCode === 'BASE')).toBe(true);

    // Antes se buscaba por código y salía la primera (la de país): explicaba con la regla equivocada.
    const explicado = explainResult(result, { rules: [porPais, porCompania] });
    expect(explicado.stages[0].lines[0].como).toBe('Tarifa pactada con la compañía');
    expect(explicado.stages[0].lines[0].origen).toMatchObject({ source: 'RULE', ruleId: 'r-party', scope: 'PARTY' });
  });

  it('las líneas de costo dicen de qué modelo vienen', () => {
    const { result } = calcular([
      makeRule({ code: 'BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '100.00' } }),
    ]);
    const costo = explainCost(result);
    expect(costo.length).toBeGreaterThan(0);
    expect(costo.every((l) => l.origen.source === 'OWN_PARAMS')).toBe(true);
  });
});
