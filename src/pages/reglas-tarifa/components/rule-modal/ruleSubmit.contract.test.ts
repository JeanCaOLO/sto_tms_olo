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

  it('desactivar una regla envía active=false y sube la versión', () => {
    const payload = toRulePayload(candidate, 'country-id', true);
    expect(payload.active).toBe(false);
    expect(payload.version).toBe(2);
  });
});
