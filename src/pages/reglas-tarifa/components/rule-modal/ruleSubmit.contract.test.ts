// El payload de una regla solo puede llevar columnas de `tarifas_pricing_rules`: el backend responde 400
// ("Columna desconocida") a cualquier otra, y con ello la regla no se crea ni se edita (ver auditoría H1).

import { describe, expect, it } from 'vitest';
import { columnNames } from '../../../../lib/tarifas/data/schema';
import { toRulePayload, type RuleCandidate } from './ruleSubmit';

const candidate = {
  scope: 'COUNTRY', partyId: null, code: 'R', name: 'R', stage: 'BASE', priority: 10, stacking: 'SUM', exclusionGroup: null,
  conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: '1' }, description: null, reason: null, effect: 'INCREASE',
  builder: null, conditionBuilder: null, active: false, effectiveFrom: null, effectiveTo: null, version: 1,
} as unknown as RuleCandidate;

describe('toRulePayload', () => {
  it.each([false, true])('solo envía columnas de la tabla (edición: %s)', (isEdit) => {
    const columns = new Set(columnNames('pricingRule'));
    const extra = Object.keys(toRulePayload(candidate, 'country-id', isEdit)).filter((key) => !columns.has(key));
    expect(extra).toEqual([]);
  });

  it('sin forma de cobro ni ligado, el payload NO lleva las columnas de sql/38 (backend sin el manifest nuevo)', () => {
    const payload = toRulePayload(candidate, 'country-id', false);
    expect(payload).not.toHaveProperty('applies_to_base');
    expect(payload).not.toHaveProperty('base_method');
  });

  it('con valor las envía; y al limpiar una regla que ya las tenía, envía null', () => {
    const conValor = { ...candidate, baseMethod: 'FIXED', appliesToBase: ['PER_KM'] } as unknown as RuleCandidate;
    expect(toRulePayload(conValor, 'c', false)).toMatchObject({ base_method: 'FIXED', applies_to_base: ['PER_KM'] });
    expect(toRulePayload(candidate, 'c', true, { base_method: 'FIXED', applies_to_base: ['PER_KM'] }))
      .toMatchObject({ base_method: null, applies_to_base: null });
  });

  it('desactivar una regla envía active=false y sube la versión', () => {
    const payload = toRulePayload(candidate, 'country-id', true);
    expect(payload.active).toBe(false);
    expect(payload.version).toBe(2);
  });
});
