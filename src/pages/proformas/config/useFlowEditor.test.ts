// @vitest-environment jsdom
//
// Guardar las fases agrupa las liquidaciones que esperaban sin proforma: si ese barrido falla, el aviso no puede decir
// "Se agruparon N" ni callar el error.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assignPendingSettlements, listFlowPhases, saveFlowPhases } from '../../../lib/tarifas/proformas';
import { useFlowEditor } from './useFlowEditor';

vi.mock('../../configuracion/admin/admin-api', () => ({ listRoles: vi.fn(async () => []), listUsers: vi.fn(async () => []) }));
vi.mock('../../../lib/tarifas/proformas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tarifas/proformas')>()),
  listFlowPhases: vi.fn(),
  saveFlowPhases: vi.fn(),
  assignPendingSettlements: vi.fn(),
}));

const assign = vi.mocked(assignPendingSettlements);
const sweepResult = (over: Partial<Awaited<ReturnType<typeof assignPendingSettlements>>>) =>
  ({ created: 0, added: 0, skipped: null, error: null, ...over }) as Awaited<ReturnType<typeof assignPendingSettlements>>;

async function ready() {
  const hook = renderHook(() => useFlowEditor('CR'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => {
  vi.mocked(listFlowPhases).mockResolvedValue([]);
  vi.mocked(saveFlowPhases).mockResolvedValue({ error: null } as Awaited<ReturnType<typeof saveFlowPhases>>);
  assign.mockReset();
});
afterEach(cleanup);

describe('useFlowEditor.save · barrido de liquidaciones', () => {
  it('con barrido exitoso dice cuántas liquidaciones se agruparon', async () => {
    assign.mockResolvedValue(sweepResult({ created: 1, added: 2 }));
    const { result } = await ready();
    await act(async () => { await result.current.save(); });
    expect(result.current.notice).toContain('Se agruparon 3 liquidaciones pendientes');
    expect(result.current.error).toBeNull();
  });

  it('si el barrido falla lo dice y no anuncia agrupadas', async () => {
    assign.mockResolvedValue(sweepResult({ created: 1, error: 'sin conexión' }));
    const { result } = await ready();
    await act(async () => { await result.current.save(); });
    expect(result.current.notice).toContain('Fases guardadas');
    expect(result.current.notice).not.toContain('Se agruparon');
    expect(result.current.error).toContain('No se pudieron agrupar las liquidaciones pendientes');
    expect(result.current.error).toContain('sin conexión');
  });

  it('si guardar las fases falla no hace el barrido', async () => {
    vi.mocked(saveFlowPhases).mockResolvedValue({ error: 'sin permiso' } as Awaited<ReturnType<typeof saveFlowPhases>>);
    const { result } = await ready();
    await act(async () => { await result.current.save(); });
    expect(assign).not.toHaveBeenCalled();
    expect(result.current.error).toBe('sin permiso');
  });
});
