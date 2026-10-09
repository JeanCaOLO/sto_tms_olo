import { describe, it, expect } from 'vitest';
import { validateVariable, type PartyVariableInput } from '../partyVariablesDataSource';

describe('validateVariable NUMBER', () => {
  it('should reject Infinity for NUMBER variables', () => {
    const input: PartyVariableInput = {
      partyId: 'party1',
      key: 'test_var',
      label: 'Test Variable',
      kind: 'NUMBER',
      origin: 'CONSTANT',
      defaultValue: 'Infinity',
      unit: null,
      active: true,
    };
    const errors = validateVariable(input, []);
    expect(errors.defaultValue).toContain('Infinito');
  });

  it('should reject very large exponent notation for NUMBER variables', () => {
    const input: PartyVariableInput = {
      partyId: 'party1',
      key: 'test_var',
      label: 'Test Variable',
      kind: 'NUMBER',
      origin: 'CONSTANT',
      defaultValue: '1e999',
      unit: null,
      active: true,
    };
    const errors = validateVariable(input, []);
    // parseMoneyInput rejects scientific notation, so it returns error about invalid number
    expect(errors.defaultValue).toContain('número');
  });

  it('should accept valid finite numbers for NUMBER variables', () => {
    const input: PartyVariableInput = {
      partyId: 'party1',
      key: 'test_var',
      label: 'Test Variable',
      kind: 'NUMBER',
      origin: 'CONSTANT',
      defaultValue: '123.45',
      unit: null,
      active: true,
    };
    const errors = validateVariable(input, []);
    expect(errors.defaultValue).toBeUndefined();
  });

  it('should reject non-numeric input for NUMBER variables', () => {
    const input: PartyVariableInput = {
      partyId: 'party1',
      key: 'test_var',
      label: 'Test Variable',
      kind: 'NUMBER',
      origin: 'CONSTANT',
      defaultValue: 'abc',
      unit: null,
      active: true,
    };
    const errors = validateVariable(input, []);
    expect(errors.defaultValue).toContain('número');
  });

  it('should accept TEXT variables with any default value', () => {
    const input: PartyVariableInput = {
      partyId: 'party1',
      key: 'test_var',
      label: 'Test Variable',
      kind: 'TEXT',
      origin: 'CONSTANT',
      defaultValue: 'any text here',
      unit: null,
      active: true,
    };
    const errors = validateVariable(input, []);
    expect(errors.defaultValue).toBeUndefined();
  });

  it('should require value for CONSTANT origin', () => {
    const input: PartyVariableInput = {
      partyId: 'party1',
      key: 'test_var',
      label: 'Test Variable',
      kind: 'TEXT',
      origin: 'CONSTANT',
      defaultValue: null,
      unit: null,
      active: true,
    };
    const errors = validateVariable(input, []);
    expect(errors.defaultValue).toContain('necesita un valor');
  });

  it('should accept empty value for non-CONSTANT origin', () => {
    const input: PartyVariableInput = {
      partyId: 'party1',
      key: 'test_var',
      label: 'Test Variable',
      kind: 'NUMBER',
      origin: 'PER_TRIP',
      defaultValue: null,
      unit: null,
      active: true,
    };
    const errors = validateVariable(input, []);
    expect(errors.defaultValue).toBeUndefined();
  });
});
