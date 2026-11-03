// @vitest-environment jsdom
//
// Emitir una liquidación: una sola vez aunque se haga clic dos veces, y con las variables que el
// cálculo usó (no con texto inválido).
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEmitTrip } from '../hooks/useEmitTrip';
import { buildEmissionInput } from '../parts/emission';
import type { LiquidarViajeController } from '../hooks/useLiquidarViajeController';

vi.mock('../parts/emission', () => ({ buildEmissionInput: vi.fn(() => ({ built: true })) }));
const build = vi.mocked(buildEmissionInput);

const PEAJE = 'custom:peaje';

function makeCtrl(over: Partial<Record<string, unknown>> = {}) {
  let releaseRecheck: (ok: boolean) => void = () => {};
  const recheck = vi.fn(() => new Promise<boolean>((resolve) => { releaseRecheck = resolve; }));
  const emit = vi.fn(async () => ({ id: 'S1' }));
  const setError = vi.fn();
  const ctrl = {
    calculation: {
      customVarFields: [{ key: PEAJE, label: 'Peaje', kind: 'NUMBER', unit: null, defaultValue: '0' }],
      blockingIssues: [], notLiquidableReason: null,
    },
    totals: { total: '100' }, effectiveResult: {}, loading: false, pending: false, saving: false,
    returns: [], customRaw: { [PEAJE]: '12' }, status: 'Borrador', notes: '', excludedSeqs: new Set<number>(),
    validateForm: vi.fn(() => true), recheck, emit, setError,
    ...over,
  };
  return { ctrl: ctrl as unknown as LiquidarViajeController, recheck, emit, setError, release: (ok: boolean) => releaseRecheck(ok) };
}

beforeEach(() => build.mockClear());
afterEach(cleanup);

describe('useEmitTrip', () => {
  it('un doble clic durante la revalidación emite una sola vez', async () => {
    const { ctrl, emit, release } = makeCtrl();
    const { result } = renderHook(() => useEmitTrip(ctrl, true));

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => { first = result.current.emitir(); });
    act(() => { second = result.current.emitir(); });
    await act(async () => { release(true); await Promise.all([first, second]); });

    expect(await second).toBeNull();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('deshabilita Emitir desde que empieza hasta que termina', async () => {
    const { ctrl, release } = makeCtrl();
    const { result } = renderHook(() => useEmitTrip(ctrl, true));
    expect(result.current.puedeEmitir).toBe(true);

    let pending!: Promise<unknown>;
    act(() => { pending = result.current.emitir(); });
    expect(result.current.puedeEmitir).toBe(false);
    await act(async () => { release(true); await pending; });
    expect(result.current.puedeEmitir).toBe(true);
  });

  it('guarda las variables ya convertidas a número, las que usó el cálculo', async () => {
    const { ctrl, release } = makeCtrl();
    const { result } = renderHook(() => useEmitTrip(ctrl, true));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.emitir(); });
    await act(async () => { release(true); await pending; });
    expect(build.mock.calls[0][1]).toEqual({ customVars: { [PEAJE]: 12 } });
  });

  it('con un número ilegible no emite y avisa', async () => {
    const { ctrl, emit, recheck, setError } = makeCtrl({ customRaw: { [PEAJE]: 'doce' } });
    const { result } = renderHook(() => useEmitTrip(ctrl, true));
    let out: unknown = 'sin-llamar';
    await act(async () => { out = await result.current.emitir(); });
    expect(out).toBeNull();
    expect(setError).toHaveBeenCalledWith('"Peaje" tiene que ser un número.');
    expect(recheck).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('si la revalidación detecta cambios no emite y se puede volver a intentar', async () => {
    const { ctrl, emit, release } = makeCtrl();
    const { result } = renderHook(() => useEmitTrip(ctrl, true));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.emitir(); });
    await act(async () => { release(false); await pending; });
    expect(emit).not.toHaveBeenCalled();
    expect(result.current.puedeEmitir).toBe(true);
  });

  it('no puede emitir con el cálculo pendiente', () => {
    const { ctrl } = makeCtrl({ pending: true });
    const { result } = renderHook(() => useEmitTrip(ctrl, true));
    expect(result.current.puedeEmitir).toBe(false);
  });
});
