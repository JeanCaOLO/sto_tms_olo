import { describe, expect, it } from 'vitest';
import { findOverlappingRule, findSimilarRule, vigenciasSePisan } from './ruleOverlap';

const base = { id: 'r1', code: 'R_DIESEL', country_id: 'c1', party_id: null, active: true, effective_from: null, effective_to: null };

describe('vigenciasSePisan', () => {
  it('dos vigencias abiertas se pisan', () => expect(vigenciasSePisan({}, {})).toBe(true));
  it('versiones consecutivas no se pisan', () => {
    expect(vigenciasSePisan({ effective_to: '2026-09-30' }, { effective_from: '2026-10-01' })).toBe(false);
    expect(vigenciasSePisan({ effective_from: '2026-10-01' }, { effective_to: '2026-09-30' })).toBe(false);
  });
  it('los extremos son inclusivos', () => {
    expect(vigenciasSePisan({ effective_to: '2026-10-01' }, { effective_from: '2026-10-01' })).toBe(true);
  });
});

describe('findOverlappingRule', () => {
  it('avisa de otra regla activa con el mismo código, país y compañía', () => {
    expect(findOverlappingRule({ ...base, code: 'r_diesel' }, [base])?.id).toBe('r1');
  });
  it('no avisa al editar la misma regla', () => {
    expect(findOverlappingRule(base, [base], 'r1')).toBeNull();
  });
  it('no avisa si la nueva está inactiva, si la otra lo está o si cambia el alcance', () => {
    expect(findOverlappingRule({ ...base, active: false }, [base])).toBeNull();
    expect(findOverlappingRule(base, [{ ...base, active: false }])).toBeNull();
    expect(findOverlappingRule({ ...base, party_id: 'p1' }, [base])).toBeNull();
    expect(findOverlappingRule({ ...base, country_id: 'c2' }, [base])).toBeNull();
  });
  it('no avisa con la versión siguiente de una regla (vigencias que no se pisan)', () => {
    const v1 = { ...base, effective_to: '2026-09-30' };
    expect(findOverlappingRule({ ...base, effective_from: '2026-10-01' }, [v1])).toBeNull();
  });
});

describe('findSimilarRule', () => {
  const full = {
    ...base, name: 'Recargo domingo', stage: 'VARIABLE', stacking: 'SUM', scope: 'COUNTRY',
    conditions: { p: 'EQ', left: 'weekday', right: 0 }, expression: { op: 'FIXED', amount: '5' },
  };
  it('avisa de otra regla con otro código pero la misma lógica', () => {
    expect(findSimilarRule({ ...full, id: 'n', code: 'R_DOMINGO_2', name: 'Otro' }, [full])).toMatchObject({ kind: 'MISMA_LOGICA' });
  });
  it('avisa del mismo nombre con otro código y otra fórmula', () => {
    const nueva = { ...full, id: 'n', code: 'OTRA', expression: { op: 'FIXED', amount: '9' } };
    expect(findSimilarRule(nueva, [full])).toMatchObject({ kind: 'MISMO_NOMBRE' });
  });
  it('lee una fila vieja (MODIFIER) como VARIABLE al compararla', () => {
    const vieja = { ...full, stage: 'MODIFIER' };
    expect(findSimilarRule({ ...full, id: 'n', code: 'COPIA', name: 'Copia' }, [vieja])).toMatchObject({ kind: 'MISMA_LOGICA' });
  });
  it('no avisa al editar la misma regla ni con otra fórmula y otro nombre', () => {
    expect(findSimilarRule(full, [full], 'r1')).toBeNull();
    expect(findSimilarRule({ ...full, id: 'n', code: 'X', name: 'Distinta', expression: { op: 'FIXED', amount: '1' } }, [full])).toBeNull();
  });
});
