// Las 4 fases del motor (BASE → VARIABLE → AJUSTE → TAX), la compatibilidad con datos guardados con 6
// etapas y los controles contra reglas repetidas.

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { RuleSchema, StageSchema } from '../schemas';
import { buildRules } from '../catalog-loader/rules';
import { mapToDomain } from '../settlements/mapToDomain';
import { classifyConflict, findRuleConflicts, vigenciasSePisan, type ComparableRule } from '../ruleConflicts';
import { legacyCategory, normalizeStage, STAGE_ORDER } from '../types';
import type { CalculateInput, Rule, TripContext } from '../types';
import {
  makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip,
} from './fixtures';

function run(rules: Rule[], trip: Partial<TripContext> = {}) {
  const { zoneGroups, zones, locations } = makeGeoVE();
  const input: CalculateInput = {
    country: makeCountryVE(), trip: makeTrip(trip), rules, zones, zoneGroups, locations,
    ...makeOwnCostStructure(), marginPolicy: makeMarginPolicy(),
  };
  return calculate(input);
}

const fijo = (code: string, amount: string, over: Partial<Rule> = {}) =>
  makeRule({ code, stage: 'VARIABLE', expression: { op: 'FIXED', amount }, ...over });

describe('fases', () => {
  it('son cuatro y en este orden', () => {
    expect(STAGE_ORDER).toEqual(['BASE', 'VARIABLE', 'ADJUSTMENT', 'TAX']);
  });

  it('las etapas viejas se pliegan a VARIABLE y la vieja pasa a ser la categoría', () => {
    expect(normalizeStage('MODIFIER')).toBe('VARIABLE');
    expect(normalizeStage('SURCHARGE')).toBe('VARIABLE');
    expect(normalizeStage('TAX')).toBe('TAX');
    expect(legacyCategory('SURCHARGE')).toBe('SURCHARGE');
    expect(legacyCategory('VARIABLE')).toBeNull();
  });

  it('el esquema acepta una etapa vieja (datos guardados) y la devuelve como VARIABLE', () => {
    expect(StageSchema.parse('SURCHARGE')).toBe('VARIABLE');
    expect(StageSchema.safeParse('NOPE').success).toBe(false);
  });

  it('una fila de BD con etapa vieja se lee como VARIABLE con su categoría', () => {
    const [rule] = buildRules([{
      id: 'r', country_id: 'VE', code: 'X', name: 'X', stage: 'MODIFIER', priority: 1, stacking: 'SUM',
      conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: '1' }, active: true,
    }], [], 'VE');
    expect(rule).toMatchObject({ stage: 'VARIABLE', category: 'MODIFIER' });
  });

  it('una fila nueva con categoría propia la conserva', () => {
    const [rule] = buildRules([{
      id: 'r', country_id: 'VE', code: 'X', name: 'X', stage: 'VARIABLE', category: 'SURCHARGE', priority: 1,
      stacking: 'SUM', conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: '1' }, active: true,
    }], [], 'VE');
    expect(rule).toMatchObject({ stage: 'VARIABLE', category: 'SURCHARGE' });
  });

  it('una liquidación guardada con 6 etapas se lee en 4 sin perder importes', () => {
    const settled = mapToDomain({
      id: 's', stage_subtotals: { BASE: '100.00', VARIABLE: '10.00', MODIFIER: '20.00', SURCHARGE: '5.00', ADJUSTMENT: '-3.00', TAX: '0.00' },
      trace: [{ seq: 1, stage: 'SURCHARGE', ruleCode: 'A', final: '5.00' }],
      rules_used: [{ code: 'A', stage: 'MODIFIER' }],
    });
    expect(settled.stageSubtotals).toEqual({ BASE: '100', VARIABLE: '35', ADJUSTMENT: '-3', TAX: '0' });
    expect(settled.trace[0]).toMatchObject({ stage: 'VARIABLE', category: 'SURCHARGE' });
    expect(settled.rulesUsed[0]).toMatchObject({ stage: 'VARIABLE', category: 'MODIFIER' });
  });

  it('el subtotal por fase suma todo lo variable y el desglose conserva la categoría', () => {
    const r = run([
      fijo('PEAJE', '10', { category: 'SURCHARGE', priority: 20 }),
      fijo('DOMINGO', '5', { category: 'MODIFIER', priority: 30 }),
    ]);
    expect(r.stageSubtotals.VARIABLE).toBe('15.00');
    expect(r.trace.filter((l) => l.category).map((l) => l.category)).toEqual(['SURCHARGE', 'MODIFIER']);
  });

  it('la categoría NO cambia el orden: manda la prioridad', () => {
    const porcentaje = fijo('PCT', '0', {
      priority: 20, category: 'MODIFIER', expression: { op: 'PERCENT', pct: '0.10', base: { of: 'RUNNING_SUBTOTAL' } },
    });
    const a = run([porcentaje, fijo('PEAJE', '100', { priority: 10, category: 'SURCHARGE' })]);
    const b = run([porcentaje, fijo('PEAJE', '100', { priority: 10, category: 'MODIFIER' })]);
    expect(a.totalLiquidado).toBe(b.totalLiquidado);
  });
});

describe('EXCLUSIVE solo en BASE', () => {
  const regla = (stage: Rule['stage'], stacking: Rule['stacking']) => ({
    id: 'r', countryId: 'VE', code: 'X', name: 'X', stage, priority: 1, stacking, exclusionGroup: null,
    conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: '1' }, isAdhoc: false, active: true, version: 1,
  });
  it('se permite en BASE', () => expect(RuleSchema.safeParse(regla('BASE', 'EXCLUSIVE')).success).toBe(true));
  it('se rechaza en VARIABLE, AJUSTE e impuesto', () => {
    for (const stage of ['VARIABLE', 'ADJUSTMENT', 'TAX'] as const) {
      expect(RuleSchema.safeParse(regla(stage, 'EXCLUSIVE')).success, stage).toBe(false);
    }
  });
  it('SUM y MAX siguen valiendo en cualquier fase', () => {
    expect(RuleSchema.safeParse(regla('VARIABLE', 'SUM')).success).toBe(true);
    expect(RuleSchema.safeParse(regla('ADJUSTMENT', 'MAX')).success).toBe(true);
  });
});

describe('reglas repetidas', () => {
  const base: ComparableRule = {
    id: 'a', code: 'R_DIESEL', name: 'Diésel', stage: 'VARIABLE', stacking: 'SUM', countryId: 'VE', scope: 'COUNTRY',
    partyId: null, active: true, effectiveFrom: null, effectiveTo: null,
    conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: '1' },
  };

  it('mismo código y alcance con vigencias solapadas: MISMO_CODIGO', () => {
    expect(classifyConflict(base, { ...base, id: 'b' })).toBe('MISMO_CODIGO');
  });
  it('versiones de una regla con vigencias que NO se solapan no chocan (R_DIESEL v1 / v2)', () => {
    const v1 = { ...base, effectiveTo: '2026-09-30' };
    const v2 = { ...base, id: 'b', effectiveFrom: '2026-10-01' };
    expect(vigenciasSePisan(v1, v2)).toBe(false);
    expect(classifyConflict(v1, v2)).toBeNull();
  });
  it('una regla de compañía con el código de una de país es sobrescritura, no conflicto', () => {
    expect(classifyConflict(base, { ...base, id: 'b', scope: 'PARTY', partyId: 'P1' })).toBeNull();
  });
  it('dos EXCLUSIVE con el mismo código (país vs. otra) no cobran doble: no es conflicto', () => {
    expect(classifyConflict({ ...base, stacking: 'EXCLUSIVE' }, { ...base, id: 'b', stacking: 'EXCLUSIVE' })).toBeNull();
  });
  it('una inactiva no choca con nadie', () => {
    expect(classifyConflict(base, { ...base, id: 'b', active: false })).toBeNull();
  });
  it('distinto código, misma fase, condición y fórmula: MISMA_LOGICA (aunque las claves vengan en otro orden)', () => {
    const otra = { ...base, id: 'b', code: 'R_DOMINGO_2', name: 'Otra', expression: { amount: '1', op: 'FIXED' } };
    expect(classifyConflict(base, otra)).toBe('MISMA_LOGICA');
  });
  it('misma fórmula en distinta fase no es la misma regla', () => {
    expect(classifyConflict(base, { ...base, id: 'b', code: 'OTRA', name: 'Otra', stage: 'ADJUSTMENT' })).toBeNull();
  });
  it('mismo nombre con otro código y otra fórmula: MISMO_NOMBRE', () => {
    const otra = { ...base, id: 'b', code: 'OTRA', name: '  diésel ', expression: { op: 'FIXED', amount: '2' } };
    expect(classifyConflict(base, otra)).toBe('MISMO_NOMBRE');
  });
  it('findRuleConflicts no repite el mismo par', () => {
    expect(findRuleConflicts([base, { ...base, id: 'b' }, { ...base, id: 'c', code: 'R_DIESEL' }])).toHaveLength(1);
  });
});

describe('el motor frena el doble cobro', () => {
  it('dos reglas con el mismo código aplicando a la vez bloquean la emisión', () => {
    const r = run([fijo('PEAJE', '10', { id: 'a' }), fijo('PEAJE', '10', { id: 'b' })]);
    expect(r.blockingIssues).toContainEqual(expect.objectContaining({ code: 'REGLA_DUPLICADA' }));
  });
  it('si las condiciones son excluyentes, no se pisan y no bloquea', () => {
    const r = run([
      fijo('PEAJE', '10', { id: 'a', conditions: { p: 'EQ', left: 'serviceType', right: 'EXPRESS' } }),
      fijo('PEAJE', '20', { id: 'b', conditions: { p: 'EQ', left: 'serviceType', right: 'STANDARD' } }),
    ]);
    expect(r.blockingIssues.some((i) => i.code === 'REGLA_DUPLICADA')).toBe(false);
  });
  it('versiones con vigencia partida (R_DIESEL v1/v2) calculan sin bloqueo', () => {
    const r = run([
      fijo('DIESEL', '10', { id: 'a', effectiveTo: '2026-07-15' }),
      fijo('DIESEL', '20', { id: 'b', effectiveFrom: '2026-07-16' }),
    ]);
    expect(r.blockingIssues.some((i) => i.code === 'REGLA_DUPLICADA')).toBe(false);
    expect(r.stageSubtotals.VARIABLE).toBe('20.00');
  });
  it('misma lógica con otro código no bloquea pero avisa', () => {
    const r = run([fijo('A', '10', { id: 'a' }), fijo('B', '10', { id: 'b' })]);
    expect(r.blockingIssues.some((i) => i.code === 'REGLA_DUPLICADA')).toBe(false);
    expect(r.warnings.some((w) => w.includes('hacen lo mismo'))).toBe(true);
  });
});
