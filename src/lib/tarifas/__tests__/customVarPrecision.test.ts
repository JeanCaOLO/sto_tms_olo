// Variables personalizadas numéricas y umbrales de margen: sin pérdida de precisión por `number`.

import { describe, expect, it } from 'vitest';
import { exactNumber } from '../money';
import { parseCustomVarValues, type CustomVarField } from '../customVarFields';
import { resolveCustomVars } from '../resolver';
import type { PartyVariable } from '../types';

describe('exactNumber', () => {
  it('devuelve number cuando cabe exacto', () => {
    expect(exactNumber('20')).toBe(20);
    expect(exactNumber('0.25')).toBe(0.25);
    expect(exactNumber(5)).toBe(5);
  });
  it('conserva el string cuando un float perdería precisión', () => {
    expect(exactNumber('12345678901234567.89')).toBe('12345678901234567.89');
  });
  it('rechaza texto, vacío y comas ambiguas', () => {
    expect(exactNumber('abc')).toBeNull();
    expect(exactNumber('')).toBeNull();
    expect(exactNumber('1,234')).toBeNull();
    expect(exactNumber(Number.NaN)).toBeNull();
    expect(exactNumber(undefined)).toBeNull();
  });
});

describe('parseCustomVarValues', () => {
  const field = (kind: 'NUMBER' | 'TEXT', defaultValue = '0'): CustomVarField => ({
    key: 'custom:peajes', label: 'Peajes', kind, defaultValue, unit: '',
  } as CustomVarField);

  it('un número ilegible es error de campo, no cero', () => {
    const { values, errors } = parseCustomVarValues([field('NUMBER')], { 'custom:peajes': 'abc' });
    expect(errors['custom:peajes']).toMatch(/número/);
    expect(values['custom:peajes']).toBeUndefined();
  });
  it('vacío toma el valor por defecto', () => {
    expect(parseCustomVarValues([field('NUMBER', '7')], {}).values['custom:peajes']).toBe(7);
  });
  it('no pierde precisión con muchas cifras', () => {
    const { values } = parseCustomVarValues([field('NUMBER')], { 'custom:peajes': '12345678901234567.89' });
    expect(values['custom:peajes']).toBe('12345678901234567.89');
  });
});

describe('resolveCustomVars', () => {
  const variable = (defaultValue: string): PartyVariable => ({
    id: 'v1', partyId: 'p1', key: 'custom:peajes', label: 'Peajes', kind: 'NUMBER', origin: 'PER_TRIP',
    defaultValue, active: true, unit: '',
  } as PartyVariable);

  it('usa el valor del viaje y cae a 0 si no es numérico', () => {
    expect(resolveCustomVars([variable('0')], { 'custom:peajes': 20 })['custom:peajes']).toBe(20);
    expect(resolveCustomVars([variable('xyz')], undefined)['custom:peajes']).toBe(0);
  });
});
