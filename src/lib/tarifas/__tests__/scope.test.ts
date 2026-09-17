// Alcance de las reglas: país + compañía. El mecanismo es uno solo —una regla de compañía con el
// mismo `code` reemplaza a la del país— y de ahí salen los tres comportamientos que el negocio
// necesita: heredar, agregar y sobrescribir.

import { describe, expect, it } from 'vitest';
import { deriveContext, resolveRules } from '../resolver';
import { makeCountryVE, makeGeoVE, makeRule, makeTrip } from './fixtures';
import type { Rule } from '../types';

const PARTY_A = 'PARTY_A';
const PARTY_B = 'PARTY_B';

function setup(rules: Rule[], partyId: string | null) {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  const trip = makeTrip({ partyId });
  const derived = deriveContext({ trip, country, zones, zoneGroups, locations });
  const result = resolveRules(
    { trip, country, rules, zones, zoneGroups, locations },
    derived,
  );
  return { ...result, codes: result.applied.map((r) => r.code) };
}

const reglaPais = (code: string, extra: Partial<Rule> = {}) =>
  makeRule({
    code,
    stage: 'BASE',
    stacking: 'SUM',
    expression: { op: 'FIXED', amount: '100.00' },
    scope: 'COUNTRY',
    ...extra,
  });

const reglaCompania = (code: string, partyId: string, extra: Partial<Rule> = {}) =>
  makeRule({
    code,
    stage: 'BASE',
    stacking: 'SUM',
    expression: { op: 'FIXED', amount: '200.00' },
    scope: 'PARTY',
    partyId,
    ...extra,
  });

describe('herencia', () => {
  it('una compañía aplica las reglas del país', () => {
    const { codes } = setup([reglaPais('BASE_PAIS')], PARTY_A);
    expect(codes).toEqual(['BASE_PAIS']);
  });

  it('una regla sin alcance declarado se trata como de país', () => {
    // Compatibilidad: todas las reglas anteriores al alcance no tienen el campo.
    const legacy = makeRule({ code: 'VIEJA', stage: 'BASE', expression: { op: 'FIXED', amount: '50.00' } });
    delete (legacy as Partial<Rule>).scope;

    const { codes } = setup([legacy], PARTY_A);
    expect(codes).toEqual(['VIEJA']);
  });

  it('un viaje sin compañía solo ve las reglas de país', () => {
    const { codes } = setup([reglaPais('BASE_PAIS'), reglaCompania('PROPIA', PARTY_A)], null);
    expect(codes).toEqual(['BASE_PAIS']);
  });
});

describe('reglas propias de la compañía', () => {
  it('se suman a las heredadas del país', () => {
    const { codes } = setup([reglaPais('BASE_PAIS'), reglaCompania('PROPIA', PARTY_A)], PARTY_A);
    expect(codes.sort()).toEqual(['BASE_PAIS', 'PROPIA']);
  });

  it('las de otra compañía no aplican', () => {
    const { codes } = setup(
      [reglaPais('BASE_PAIS'), reglaCompania('DE_OTRA', PARTY_B)],
      PARTY_A,
    );
    expect(codes).toEqual(['BASE_PAIS']);
  });

  it('las de otra compañía tampoco ensucian la lista de descartadas', () => {
    // No están "descartadas", están fuera de alcance. Enumerarlas inflaría la traza y el snapshot
    // de la proforma con una entrada por cada regla de cada compañía del país.
    const { discarded } = setup(
      [reglaPais('BASE_PAIS'), reglaCompania('DE_OTRA', PARTY_B)],
      PARTY_A,
    );
    expect(discarded.map((d) => d.ruleCode)).not.toContain('DE_OTRA');
  });
});

describe('sobrescritura por código', () => {
  it('la regla de la compañía reemplaza a la del país con el mismo código', () => {
    const { applied, codes } = setup(
      [reglaPais('TARIFA'), reglaCompania('TARIFA', PARTY_A)],
      PARTY_A,
    );

    expect(codes).toEqual(['TARIFA']);
    // La que sobrevive es la de la compañía: 200, no los 100 del país.
    expect(applied[0]?.scope).toBe('PARTY');
    expect(applied[0]?.partyId).toBe(PARTY_A);
  });

  it('deja registrado por qué se descartó la del país', () => {
    const { discarded } = setup([reglaPais('TARIFA'), reglaCompania('TARIFA', PARTY_A)], PARTY_A);

    const entry = discarded.find((d) => d.ruleCode === 'TARIFA');
    expect(entry?.reason).toBe('OVERRIDDEN_BY_PARTY');
    expect(entry?.detail).toContain('compañía');
  });

  it('la del país sigue valiendo para las demás compañías', () => {
    const rules = [reglaPais('TARIFA'), reglaCompania('TARIFA', PARTY_A)];

    const otra = setup(rules, PARTY_B);
    expect(otra.applied[0]?.scope).toBe('COUNTRY');
    expect(otra.discarded.map((d) => d.ruleCode)).not.toContain('TARIFA');
  });

  it('una compañía puede reactivar para sí una regla de país desactivada', () => {
    // El país la apagó; la compañía escribe su propia versión activa con el mismo código.
    const { codes, applied } = setup(
      [
        reglaPais('ESTACIONAL', { active: false }),
        reglaCompania('ESTACIONAL', PARTY_A, { active: true }),
      ],
      PARTY_A,
    );

    expect(codes).toEqual(['ESTACIONAL']);
    expect(applied[0]?.scope).toBe('PARTY');
  });

  it('y lo contrario: una compañía puede apagar para sí una regla de país activa', () => {
    const { codes, discarded } = setup(
      [
        reglaPais('RECARGO', { active: true }),
        reglaCompania('RECARGO', PARTY_A, { active: false }),
      ],
      PARTY_A,
    );

    expect(codes).toEqual([]);
    expect(discarded.map((d) => d.reason)).toContain('OVERRIDDEN_BY_PARTY');
    expect(discarded.map((d) => d.reason)).toContain('INACTIVE');
  });
});
