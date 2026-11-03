// @vitest-environment jsdom
//
// Guardar una regla de compañía: se valida ANTES de crear el perfil de cálculo de la compañía, y si lo que viene después
// falla (o se rechaza la regla repetida) el perfil recién creado se deshace. Y el mensaje de una regla inválida habla en
// español, no con el nombre interno del campo.
import type { FormEvent } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveRule } from '../../../../lib/tarifas/localRulesDataSource';
import { discardNewParty } from '../../../../lib/tarifas/partiesDataSource';
import { confirmDuplicate } from './confirmDuplicate';
import { ruleIssueMessage } from './ruleSubmit';
import type { SubmitContext } from './ruleSubmitSteps';
import { useRuleSubmit } from './useRuleSubmit';

const steps = vi.hoisted(() => ({ resolvePartyId: vi.fn() }));
vi.mock('./ruleSubmitSteps', () => ({
  preconditionError: () => null,
  parseConditions: () => ({ value: { p: 'ALWAYS' } }),
  parseExpression: () => ({ value: { op: 'FIXED', amount: '25' } }),
  resolvePartyId: steps.resolvePartyId,
}));
vi.mock('./confirmDuplicate', () => ({ confirmDuplicate: vi.fn(async () => true) }));
vi.mock('../../../../lib/tarifas/localRulesDataSource', () => ({ saveRule: vi.fn() }));
vi.mock('../../../../lib/tarifas/partiesDataSource', () => ({ discardNewParty: vi.fn() }));
vi.mock('../../../../lib/liquidador/auditLog', () => ({ registrarEventoSeguro: vi.fn() }));
vi.mock('../../../../lib/tarifas/actor', () => ({ getActorRole: () => 'Admin' }));

const save = vi.mocked(saveRule);
const discard = vi.mocked(discardNewParty);
const duplicate = vi.mocked(confirmDuplicate);

const formData = (over: Record<string, unknown> = {}) => ({
  country_id: 'CR', scope: 'PARTY', party_id: '', code: 'bono', name: 'Bono', stage: 'BASE', category: '', priority: '10',
  stacking: 'SUM', exclusion_group: '', applies_to_base: [], reason: '', active: true, effective_from: '', effective_to: '',
  ...over,
});

const context = (data = formData()) => ({
  rule: undefined, organizationId: 'ORG', usuarioActivo: 'Auditor', allowed: true,
  form: { formData: data }, conditions: { currentConditionBuilder: () => null }, calc: { tab: 'advanced', builder: {} },
  selectedCarrierId: 'C1', missingVars: [], effectiveDescription: '', onSuccess: vi.fn(), onClose: vi.fn(),
}) as unknown as SubmitContext;

const submit = async (c: SubmitContext) => {
  const hook = renderHook(() => useRuleSubmit(c));
  await act(async () => { await hook.result.current.handleSubmit({ preventDefault: () => undefined } as FormEvent); });
  return hook;
};

beforeEach(() => {
  steps.resolvePartyId.mockReset();
  steps.resolvePartyId.mockResolvedValue({ value: { id: 'P-NEW', created: true } });
  save.mockReset();
  save.mockResolvedValue({ error: null } as Awaited<ReturnType<typeof saveRule>>);
  discard.mockReset();
  duplicate.mockReset();
  duplicate.mockResolvedValue(true);
});
afterEach(cleanup);

describe('useRuleSubmit · orden y limpieza', () => {
  it('una regla inválida NO crea el perfil de la compañía', async () => {
    const { result } = await submit(context(formData({ name: '' })));
    expect(steps.resolvePartyId).not.toHaveBeenCalled();
    expect(result.current.errorMsg).toMatch(/^Regla inválida: Nombre/);
    expect(save).not.toHaveBeenCalled();
  });

  it('una regla válida crea el perfil, lo usa al guardar y no lo deshace', async () => {
    const c = context();
    await submit(c);
    expect(steps.resolvePartyId).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect((save.mock.calls[0][1] as { party_id: string }).party_id).toBe('P-NEW');
    expect(discard).not.toHaveBeenCalled();
    expect(c.onSuccess).toHaveBeenCalledTimes(1);
  });

  it('si guardar falla, el perfil recién creado se deshace', async () => {
    save.mockResolvedValue({ error: new Error('falló la base') } as Awaited<ReturnType<typeof saveRule>>);
    const c = context();
    const { result } = await submit(c);
    expect(discard).toHaveBeenCalledWith('P-NEW');
    expect(result.current.errorMsg).toContain('falló la base');
    expect(c.onSuccess).not.toHaveBeenCalled();
  });

  it('si se rechaza guardar la regla repetida, el perfil recién creado se deshace', async () => {
    duplicate.mockResolvedValue(false);
    const c = context();
    await submit(c);
    expect(save).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith('P-NEW');
    expect(c.onSuccess).not.toHaveBeenCalled();
  });

  it('un perfil que ya existía nunca se deshace', async () => {
    steps.resolvePartyId.mockResolvedValue({ value: { id: 'P-OLD', created: false } });
    save.mockResolvedValue({ error: new Error('falló la base') } as Awaited<ReturnType<typeof saveRule>>);
    await submit(context());
    expect(discard).not.toHaveBeenCalled();
  });

  it('con alcance de país no busca ni crea ningún perfil', async () => {
    steps.resolvePartyId.mockResolvedValue({ value: { id: null, created: false } });
    const c = context(formData({ scope: 'COUNTRY' }));
    await submit(c);
    expect(save).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
    expect(c.onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('ruleIssueMessage', () => {
  it('traduce el nombre del campo', () => {
    expect(ruleIssueMessage({ path: ['exclusionGroup'], message: 'Required' })).toBe('Regla inválida: Grupo de exclusión — Required');
    expect(ruleIssueMessage({ path: ['effectiveTo'], message: 'La fecha de fin no puede ser anterior a la de inicio.' }))
      .toBe('Regla inválida: Vigente hasta — La fecha de fin no puede ser anterior a la de inicio.');
  });

  it('en un campo anidado conserva el detalle', () => {
    expect(ruleIssueMessage({ path: ['expression', 'amount'], message: 'Invalid' })).toBe('Regla inválida: Cálculo (amount) — Invalid');
  });

  it('un campo sin etiqueta conserva su ruta', () => {
    expect(ruleIssueMessage({ path: ['campoNuevo'], message: 'x' })).toBe('Regla inválida: campoNuevo — x');
  });

  it('sin ruta no deja un guion colgando', () => {
    expect(ruleIssueMessage({ path: [], message: 'Invalid input' })).toBe('Regla inválida: Invalid input');
  });
});
