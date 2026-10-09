import { useCallback, useEffect, useState } from 'react';
import { activeStructure, listRows } from '../../../lib/tarifas/costStructureDataSource';
import { listPartyVariables } from '../../../lib/tarifas/partyVariablesDataSource';
import type { CostStructure, CostStructureRow, PartyVariable } from '../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../lib/tarifas/parties';

export function useStructureData(party: CarrierProfile | null, partyId: string | null, isOpen: boolean) {
  const [structure, setStructure] = useState<CostStructure | null>(null);
  const [rows, setRows] = useState<CostStructureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [variables, setVariables] = useState<PartyVariable[]>([]);
  const [inherited, setInherited] = useState<{ structure: CostStructure; rows: CostStructureRow[] } | null>(null);

  const load = useCallback(async () => {
    if (!party) return;
    setLoading(true);
    setError('');
    try {
      let existing: CostStructure | null = null;
      if (partyId) {
        const vars = await listPartyVariables(partyId);
        setVariables(vars.filter((v) => v.kind === 'NUMBER'));
        existing = await activeStructure(partyId);
      } else {
        setVariables([]);
      }
      setStructure(existing);
      setRows(existing ? await listRows(existing.id) : []);

      if (!existing && party.countryId) {
        const base = await activeStructure(null, party.countryId);
        setInherited(base ? { structure: base, rows: await listRows(base.id) } : null);
      } else {
        setInherited(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [party, partyId]);

  useEffect(() => {
    if (isOpen && party) void load();
  }, [isOpen, party, load]);

  return { structure, rows, setRows, loading, error, setError, variables, inherited, load };
}
