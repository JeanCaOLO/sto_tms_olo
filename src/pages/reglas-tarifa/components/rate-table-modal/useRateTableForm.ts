// Hook para manejar el formulario de tarifarios.

import { useMemo } from 'react';
import { labelsOf } from '../../../../lib/tarifas/partyVariablesDataSource';
import type { RateTable } from '../../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import { useRateTableFormState } from './useRateTableFormState';
import { useRateTablePartyVars } from './useRateTablePartyVars';
import { useRateTableKeys } from './useRateTableKeys';
import { useRateTableSave } from './useRateTableSave';

export function useRateTableForm(table: RateTable | null, isOpen: boolean, countryId: string, parties: CarrierProfile[]) {
  const { state, setState, set } = useRateTableFormState(table, isOpen, countryId);
  useRateTablePartyVars(isOpen, state.form.partyId, setState);
  const keys = useRateTableKeys(state, setState, set);

  const claveCambiada = !!table
    && (table.keyColumns.length !== state.form.keyColumns.length
      || table.keyColumns.some((c, i) => c !== state.form.keyColumns[i]));

  const selectedCarrierId = state.carrierPick
    ?? parties.find((p) => p.partyId === state.form.partyId)?.carrierId
    ?? '';

  const partiesLoadingWhenPartySet = state.form.partyId && selectedCarrierId === '' && parties.length > 0 === false;

  const { handleSave } = useRateTableSave(state, setState, table, selectedCarrierId);
  const customLabels = useMemo(() => labelsOf(state.partyVars), [state.partyVars]);

  return {
    ...state,
    ...keys,
    claveCambiada,
    selectedCarrierId,
    partiesLoadingWhenPartySet,
    customLabels,
    set,
    handleSave,
    setCarrierPick: (val: string) => setState((s) => ({ ...s, carrierPick: val })),
  };
}
