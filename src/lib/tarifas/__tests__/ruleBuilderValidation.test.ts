import { describe, it, expect } from 'vitest';
import { validateBuilder, validateConditionRows } from '../rule-builder';
import type { RuleBuilderForm, ConditionBuilderForm } from '../types';

describe('validateBuilder', () => {
  it('should validate TIERED tiers are strictly ascending', () => {
    const form: RuleBuilderForm = {
      operator: 'TIERED',
      tierMode: 'RATE',
      effect: 'INCREASE',
      variable: 'km',
      value: '0',
      tiers: [
        { upTo: 100, amount: '5' },
        { upTo: 50, amount: '3' }, // Error: not ascending
        { upTo: null, amount: '2' },
      ],
    };
    const errors = validateBuilder(form);
    expect(errors.tiers).toContain('ascendente');
  });

  it('should validate TIERED upTo are non-negative', () => {
    const form: RuleBuilderForm = {
      operator: 'TIERED',
      tierMode: 'RATE',
      effect: 'INCREASE',
      variable: 'km',
      value: '0',
      tiers: [
        { upTo: -10, amount: '5' }, // Error: negative
        { upTo: null, amount: '2' },
      ],
    };
    const errors = validateBuilder(form);
    expect(errors.tiers).toContain('no negativos');
  });

  it('should require exactly one open tier and it must be last', () => {
    const form: RuleBuilderForm = {
      operator: 'TIERED',
      tierMode: 'RATE',
      effect: 'INCREASE',
      variable: 'km',
      value: '0',
      tiers: [
        { upTo: 100, amount: '5' },
        { upTo: null, amount: '3' },
        { upTo: 200, amount: '2' }, // Error: tier after open
      ],
    };
    const errors = validateBuilder(form);
    expect(errors.tiers).toContain('último');
  });

  it('should validate PER_BLOCK blockSize is a positive integer', () => {
    const form: RuleBuilderForm = {
      operator: 'PER_BLOCK',
      effect: 'INCREASE',
      variable: 'km',
      value: '10',
      blockSize: 2.5, // Error: not integer
    };
    const errors = validateBuilder(form);
    expect(errors.blockSize).toContain('entero');
  });

  it('should validate PERCENT with RULE base requires ruleCode', () => {
    const form: RuleBuilderForm = {
      operator: 'PERCENT',
      effect: 'INCREASE',
      variable: 'km',
      value: '10',
      percentBase: { of: 'RULE', ruleCode: '' }, // Error: empty ruleCode
    };
    const errors = validateBuilder(form);
    expect(errors.percentBase).toContain('indicá cuál');
  });

  it('should reject DECREASE percent over 100', () => {
    const form: RuleBuilderForm = {
      operator: 'PERCENT',
      effect: 'DECREASE',
      variable: 'km',
      value: '150',
      percentBase: { of: 'RUNNING_SUBTOTAL' },
    };
    const errors = validateBuilder(form);
    expect(errors.value).toContain('100%');
  });
});

describe('validateConditionRows', () => {
  it('should validate BETWEEN from <= to', () => {
    const form: ConditionBuilderForm = {
      mode: 'rows',
      combinator: 'AND',
      rows: [
        { left: 'km', op: 'BETWEEN', negate: false, right: '', values: '', from: '100', to: '50' },
      ],
    };
    const errors = validateConditionRows(form);
    expect(errors[0]).toContain('desde');
  });

  it('should validate BETWEEN from is numeric', () => {
    const form: ConditionBuilderForm = {
      mode: 'rows',
      combinator: 'AND',
      rows: [
        { left: 'km', op: 'BETWEEN', negate: false, right: '', values: '', from: 'abc', to: '100' },
      ],
    };
    const errors = validateConditionRows(form);
    expect(errors[0]).toContain('desde');
  });

  it('should accept valid BETWEEN ranges', () => {
    const form: ConditionBuilderForm = {
      mode: 'rows',
      combinator: 'AND',
      rows: [
        { left: 'km', op: 'BETWEEN', negate: false, right: '', values: '', from: '50', to: '100' },
      ],
    };
    const errors = validateConditionRows(form);
    expect(errors[0]).toBeUndefined();
  });

  it('should skip validation for empty rows', () => {
    const form: ConditionBuilderForm = {
      mode: 'rows',
      combinator: 'AND',
      rows: [
        { left: 'km', op: 'BETWEEN', negate: false, right: '', values: '', from: '', to: '' },
      ],
    };
    const errors = validateConditionRows(form);
    expect(errors[0]).toBeUndefined();
  });
});
