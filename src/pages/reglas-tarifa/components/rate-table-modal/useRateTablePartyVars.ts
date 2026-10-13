import { useEffect } from 'react';
import { listPartyVariables } from '../../../../lib/tarifas/partyVariablesDataSource';
import type { SetRateTableFormState } from './rateTableFormState';

/** Variables propias de la compañía elegida: pueden usarse como parte de la clave del tarifario. */
export function useRateTablePartyVars(isOpen: boolean, partyId: string | null, setState: SetRateTableFormState) {
  useEffect(() => {
    if (!isOpen || !partyId) {
      setState((s) => ({ ...s, partyVars: [] }));
      return;
    }
    let cancelled = false;
    listPartyVariables(partyId)
      .then((list) => { if (!cancelled) setState((s) => ({ ...s, partyVars: list })); })
      .catch(() => { if (!cancelled) setState((s) => ({ ...s, partyVars: [] })); });
    return () => { cancelled = true; };
  }, [isOpen, partyId, setState]);
}
