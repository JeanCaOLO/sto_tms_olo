// @vitest-environment jsdom
//
// Variables del viaje tecleadas en el modal de liquidar: se siembran una vez, y teclear recalcula.
import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCustomVarsState } from '../hooks/useCustomVarsState';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';
import type { SettlementRecord } from '../../../lib/tarifas/types';

const PEAJE = 'custom:peaje';
const ESPERA = 'custom:espera';

const fields = [
  { key: PEAJE, label: 'Peaje', kind: 'NUMBER' as const, unit: null, defaultValue: '0' },
  { key: ESPERA, label: 'Espera', kind: 'NUMBER' as const, unit: 'h', defaultValue: '2' },
];
const makeCalculation = () => ({ customVarFields: fields }) as unknown as TripCalculation;

const onError = vi.fn();
const onCalcTriggered = vi.fn();

// Imita lo que hace el controlador: `pending` vive afuera y el cálculo lo limpia al terminar.
function useHarness(initial: { calculation: TripCalculation | null; settlement: SettlementRecord | null }) {
  const [pending, setPending] = useState(false);
  const state = useCustomVarsState({
    calculation: initial.calculation,
    settlement: initial.settlement,
    pending,
    onPendingChange: setPending,
    onError,
    onCalcTriggered: (edits) => { onCalcTriggered(edits); setPending(false); },
  });
  return { ...state, pending };
}

beforeEach(() => {
  vi.useFakeTimers();
  onError.mockReset();
  onCalcTriggered.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useCustomVarsState', () => {
  it('siembra los valores por defecto una sola vez, aunque llegue un cálculo nuevo', () => {
    const { result, rerender } = renderHook((props) => useHarness(props), {
      initialProps: { calculation: makeCalculation(), settlement: null as SettlementRecord | null },
    });
    expect(result.current.customRaw).toEqual({ [PEAJE]: '0', [ESPERA]: '2' });

    act(() => result.current.handleSetRaw(PEAJE, '15'));
    // Llega un cálculo nuevo (p. ej. el recálculo): lo tecleado no se pisa con los valores por defecto.
    rerender({ calculation: makeCalculation(), settlement: null });
    expect(result.current.customRaw[PEAJE]).toBe('15');
  });

  it('al re-liquidar parte de lo guardado en la liquidación y completa con los valores por defecto', () => {
    const settlement = { tripEdits: { customVars: { [PEAJE]: 30 } } } as unknown as SettlementRecord;
    const { result } = renderHook(() => useHarness({ calculation: makeCalculation(), settlement }));
    expect(result.current.customRaw).toEqual({ [PEAJE]: '30', [ESPERA]: '2' });
  });

  it('no vacía lo tecleado si el cálculo pasa a null por un error', () => {
    const { result, rerender } = renderHook((props) => useHarness(props), {
      initialProps: { calculation: makeCalculation() as TripCalculation | null, settlement: null as SettlementRecord | null },
    });
    act(() => result.current.handleSetRaw(PEAJE, '15'));
    rerender({ calculation: null, settlement: null });
    expect(result.current.customRaw[PEAJE]).toBe('15');
  });

  it('teclear marca pendiente y recalcula con los valores ya convertidos tras 400 ms', () => {
    const { result } = renderHook(() => useHarness({ calculation: makeCalculation(), settlement: null }));
    act(() => result.current.handleSetRaw(PEAJE, '15.5'));
    expect(result.current.pending).toBe(true);
    expect(onCalcTriggered).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(399); });
    expect(onCalcTriggered).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });

    expect(onCalcTriggered).toHaveBeenCalledTimes(1);
    expect(onCalcTriggered).toHaveBeenCalledWith({ customVars: { [PEAJE]: 15.5, [ESPERA]: 2 } });
    expect(result.current.pending).toBe(false);
  });

  it('un renderizado ajeno durante la pausa no reinicia los 400 ms', () => {
    const calculation = makeCalculation();
    const { result, rerender } = renderHook(
      (props: { calculation: TripCalculation; settlement: SettlementRecord | null; tick: number }) => useHarness(props),
      { initialProps: { calculation, settlement: null, tick: 0 } },
    );
    act(() => result.current.handleSetRaw(PEAJE, '9'));
    act(() => { vi.advanceTimersByTime(300); });
    // Mismo cálculo, solo un render más (el controlador pasa callbacks nuevos en cada render):
    // antes esto reiniciaba la espera.
    rerender({ calculation, settlement: null, tick: 1 });
    act(() => { vi.advanceTimersByTime(150); });
    expect(onCalcTriggered).toHaveBeenCalledTimes(1);
  });

  it('un número ilegible avisa y no recalcula', () => {
    const { result } = renderHook(() => useHarness({ calculation: makeCalculation(), settlement: null }));
    act(() => result.current.handleSetRaw(PEAJE, 'abc'));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onCalcTriggered).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('"Peaje" tiene que ser un número.');
    expect(result.current.pending).toBe(false);
  });
});
