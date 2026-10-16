import { useEffect, useState } from 'react';
import { listPartyVariables } from '../../../lib/tarifas/partyVariablesDataSource';
import type { PartyVariable } from '../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../lib/tarifas/parties';

/** Carga las variables de la compañía (incluidas las dadas de baja) cada vez que se abre o cambia de perfil. */
export function useVariablesList(
  isOpen: boolean,
  party: CarrierProfile | null,
  partyId: string | null,
  onError: (message: string) => void,
) {
  const [variables, setVariables] = useState<PartyVariable[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!party || !partyId) { setVariables([]); return; }
    setLoading(true);
    try {
      setVariables(await listPartyVariables(partyId, { includeInactive: true }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && party && partyId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, party, partyId]);

  return { variables, loading, load };
}
