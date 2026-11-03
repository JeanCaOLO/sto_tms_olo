// @vitest-environment jsdom
//
// Al cambiar de organización con una carga en vuelo, la respuesta de la organización anterior que llega tarde no
// puede pisar los datos de la actual. (El "cancelado" se reiniciaba a false en cada efecto y no descartaba nada.)
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRulesAndParties, fetchZones } from '../api/reglasTarifaApi';
import type { RuleRow, ZoneRow } from '../types';
import { useRulesAndParties } from './useRulesAndParties';
import { useZones } from './useZones';

vi.mock('../api/reglasTarifaApi', () => ({ fetchRulesAndParties: vi.fn(), fetchZones: vi.fn() }));
const fetchRules = vi.mocked(fetchRulesAndParties);
const fetchZ = vi.mocked(fetchZones);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

type RulesResult = Awaited<ReturnType<typeof fetchRulesAndParties>>;
const rulesOf = (id: string) => ({ parties: [], rules: [{ id }] as unknown as RuleRow[] }) as RulesResult;
const zonesOf = (id: string) => [{ id }] as unknown as ZoneRow[];

beforeEach(() => { fetchRules.mockReset(); fetchZ.mockReset(); });
afterEach(cleanup);

describe('useRulesAndParties · respuestas viejas', () => {
  it('la respuesta de la organización anterior que llega tarde no pisa a la actual', async () => {
    const old = deferred<RulesResult>();
    const fresh = deferred<RulesResult>();
    fetchRules.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(({ org }) => useRulesAndParties(org), { initialProps: { org: 'A' } });
    rerender({ org: 'B' });

    await act(async () => { fresh.resolve(rulesOf('regla-B')); });
    await act(async () => { old.resolve(rulesOf('regla-A')); });
    expect(result.current.rules.map((r) => r.id)).toEqual(['regla-B']);
    expect(result.current.loading).toBe(false);
  });

  it('una recarga manual (load) tras guardar gana sobre una carga anterior todavía en vuelo', async () => {
    const first = deferred<RulesResult>();
    const second = deferred<RulesResult>();
    fetchRules.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useRulesAndParties('A'));

    act(() => { void result.current.load(); });
    await act(async () => { second.resolve(rulesOf('actual')); });
    await act(async () => { first.resolve(rulesOf('vieja')); });
    expect(result.current.rules.map((r) => r.id)).toEqual(['actual']);
  });
});

describe('useZones · respuestas viejas', () => {
  it('la respuesta de la organización anterior que llega tarde no pisa a la actual', async () => {
    const old = deferred<ZoneRow[]>();
    const fresh = deferred<ZoneRow[]>();
    fetchZ.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(({ org }) => useZones(org), { initialProps: { org: 'A' } });
    rerender({ org: 'B' });

    await act(async () => { fresh.resolve(zonesOf('zona-B')); });
    await act(async () => { old.resolve(zonesOf('zona-A')); });
    expect(result.current.zones.map((z) => z.id)).toEqual(['zona-B']);
    expect(result.current.loading).toBe(false);
  });
});
