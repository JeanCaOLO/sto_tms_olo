import { useMemo } from 'react';
import { keyVarsFor, type RateTableInput } from '../../../../lib/tarifas/rateTablesDataSource';
import type { VarKey } from '../../../../lib/tarifas/types';
import type { RateTableFormState, SetRateTableFormState } from './rateTableFormState';

type Setter = <K extends keyof RateTableInput>(key: K, value: RateTableInput[K]) => void;

/** Edición de las variables que forman la clave y de las columnas de valor del tarifario. */
export function useRateTableKeys(state: RateTableFormState, setState: SetRateTableFormState, set: Setter) {
  const disponibles = useMemo(
    () => keyVarsFor(state.partyVars).filter((v) => !state.form.keyColumns.includes(v)),
    [state.form.keyColumns, state.partyVars],
  );

  const agregarColumna = (key: string) => {
    if (!key || state.form.keyColumns.includes(key as VarKey)) return;
    set('keyColumns', [...state.form.keyColumns, key as VarKey]);
  };

  const quitarColumna = (index: number) => {
    set('keyColumns', state.form.keyColumns.filter((_, i) => i !== index));
  };

  const moverColumna = (index: number, delta: number) => {
    const destino = index + delta;
    if (destino < 0 || destino >= state.form.keyColumns.length) return;
    const copia = [...state.form.keyColumns];
    [copia[index], copia[destino]] = [copia[destino]!, copia[index]!];
    set('keyColumns', copia);
  };

  const cambiarColumnasDeValor = (text: string) => {
    setState((s) => ({ ...s, valueColumnsText: text }));
    set('valueColumns', text.split(',').map((c) => c.trim()).filter(Boolean));
  };

  return { disponibles, agregarColumna, quitarColumna, moverColumna, cambiarColumnasDeValor };
}
