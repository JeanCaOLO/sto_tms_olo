import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveRule = vi.fn();
const deleteRule = vi.fn();
const registrar = vi.fn();

vi.mock('../../../lib/tarifas/localRulesDataSource', () => ({
  saveRule: (...a: unknown[]) => saveRule(...a),
  deleteRule: (...a: unknown[]) => deleteRule(...a),
  listRules: vi.fn(),
  listZones: vi.fn(),
}));
vi.mock('../../../lib/tarifas/partiesDataSource', () => ({ listCarrierProfiles: vi.fn() }));
vi.mock('../../../lib/liquidador/auditLog', () => ({ registrarEventoSeguro: (...a: unknown[]) => registrar(...a) }));
vi.mock('../../../lib/tarifas/actor', () => ({ getActorRole: () => 'admin' }));

import { bulkSummary, runBulkRules } from './bulkRules';
import type { RuleRow } from '../types';

const rule = (id: string, code: string): RuleRow => ({ id, code, name: code, scope: 'COUNTRY', stacking: 'SUM', active: true });
const ctx = { organizationId: 'ORG', userName: 'Ana' };

beforeEach(() => {
  saveRule.mockReset().mockResolvedValue({ error: null });
  deleteRule.mockReset().mockResolvedValue({ error: null });
  registrar.mockReset().mockResolvedValue(undefined);
});

describe('runBulkRules', () => {
  it('desactivar escribe solo { active: false } y registra cada cambio en la bitácora', async () => {
    const out = await runBulkRules('deactivate', [rule('1', 'A'), rule('2', 'B')], ctx);
    expect(out.done).toHaveLength(2);
    expect(saveRule).toHaveBeenCalledWith('ORG', { active: false }, '1');
    expect(saveRule).toHaveBeenCalledWith('ORG', { active: false }, '2');
    expect(registrar).toHaveBeenCalledTimes(2);
    expect(registrar.mock.calls[0][0]).toMatchObject({ accion: 'UPDATE', entidadId: '1', despues: { active: false } });
  });

  it('activar escribe { active: true }', async () => {
    await runBulkRules('activate', [rule('1', 'A')], ctx);
    expect(saveRule).toHaveBeenCalledWith('ORG', { active: true }, '1');
  });

  it('una que falla no detiene a las demás y se informa con su motivo', async () => {
    deleteRule
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: '23503', message: 'fk' } })
      .mockResolvedValueOnce({ error: null });
    const rules = [rule('1', 'A'), rule('2', 'B'), rule('3', 'C')];
    const out = await runBulkRules('delete', rules, ctx);
    expect(out.done.map((r) => r.code)).toEqual(['A', 'C']);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0].message).toContain('referenciada');
    expect(registrar).toHaveBeenCalledTimes(2); // la fallida no deja bitácora
    expect(bulkSummary('delete', 3, out)).toBe('Se eliminaron 2 de 3 reglas. B: está referenciada en liquidaciones existentes.');
  });

  it('un error inesperado (red) también cuenta como fallo de esa regla', async () => {
    saveRule.mockRejectedValueOnce(new Error('sin red'));
    const out = await runBulkRules('activate', [rule('1', 'A')], ctx);
    expect(out.failed[0].message).toBe('sin red');
    expect(bulkSummary('activate', 1, out)).toContain('Se activaron 0 de 1');
  });
});
