import { describe, expect, it } from 'vitest';
import { evaluatePred } from '../evaluator/predicates';
import type { VarBag, VarValue } from '../types';

// Solo interesa una variable; el resto del VarBag no participa en la condición.
const bag = (weightKg: VarValue): VarBag => ({ weightKg } as unknown as VarBag);

describe('evaluatePred con decimales exactos', () => {
  it('compara montos largos sin perder cifras', () => {
    const vars = bag('9007199254740993.01');
    expect(evaluatePred({ p: 'GT', left: 'weightKg', right: '9007199254740993.00' }, vars)).toBe(true);
    expect(evaluatePred({ p: 'LTE', left: 'weightKg', right: '9007199254740993.00' }, vars)).toBe(false);
  });
  it('0.30 en texto es igual a 0.3', () => {
    expect(evaluatePred({ p: 'EQ', left: 'weightKg', right: 0.3 }, bag('0.30'))).toBe(true);
  });
  it('un valor no numérico nunca cumple GT/BETWEEN', () => {
    expect(evaluatePred({ p: 'GT', left: 'weightKg', right: 1 }, bag('abc'))).toBe(false);
    expect(evaluatePred({ p: 'BETWEEN', left: 'weightKg', from: 0, to: 9 }, bag(''))).toBe(false);
  });
});
