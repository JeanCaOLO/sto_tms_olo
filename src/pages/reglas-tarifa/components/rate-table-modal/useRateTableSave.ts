import { saveRateTable } from '../../../../lib/tarifas/rateTablesDataSource';
import { ensurePartyProfile } from '../../../../lib/tarifas/partiesDataSource';
import type { RateTable } from '../../../../lib/tarifas/types';
import type { RateTableFormState, SetRateTableFormState } from './rateTableFormState';

/** Guarda el tarifario (creando antes el perfil de la compañía si hace falta). true = guardado. */
export function useRateTableSave(
  state: RateTableFormState,
  setState: SetRateTableFormState,
  table: RateTable | null,
  selectedCarrierId: string,
) {
  const handleSave = async (): Promise<boolean> => {
    setState((s) => ({ ...s, generalError: '', saving: true }));
    try {
      let partyId = state.form.partyId;
      if (selectedCarrierId && !partyId) {
        const ensured = await ensurePartyProfile(selectedCarrierId);
        if (ensured.status === 'failed') {
          setState((s) => ({ ...s, generalError: `No se pudo crear el perfil de cálculo de la compañía: ${ensured.error.message}` }));
          return false;
        }
        partyId = ensured.partyId;
      }
      const finalPartyId = selectedCarrierId ? partyId : state.form.partyId;
      const result = await saveRateTable({ ...state.form, partyId: finalPartyId }, table?.id);
      if (result.status === 'invalid') {
        setState((s) => ({ ...s, errors: result.errors }));
        return false;
      }
      if (result.status === 'failed') {
        setState((s) => ({ ...s, generalError: result.error.message }));
        return false;
      }
      return true;
    } finally {
      setState((s) => ({ ...s, saving: false }));
    }
  };

  return { handleSave };
}
