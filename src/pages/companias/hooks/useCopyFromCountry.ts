import { useState } from 'react';
import { importRows, saveStructure } from '../../../lib/tarifas/costStructureDataSource';
import { toRowInput } from '../components/cost-structure/rowInput';
import { messageOf, type StructureCtx } from './costStructureContext';

/** Crea una estructura propia copiando los conceptos de la del país. */
export function useCopyFromCountry(ctx: StructureCtx, ensureParty: () => Promise<string | null>) {
  const [copying, setCopying] = useState(false);
  const { party, inherited, setError, load } = ctx;

  const handleCopyFromCountry = async () => {
    if (!inherited || !party) return;
    setError('');
    setCopying(true);
    try {
      const targetId = await ensureParty();
      if (targetId === null) return;
      const saved = await saveStructure({
        partyId: targetId,
        countryId: party.countryId ?? '',
        name: `${inherited.structure.name} (propia)`,
        operatingDaysPerMonth: inherited.structure.operatingDaysPerMonth,
        params: inherited.structure.params,
        effectiveFrom: null,
        active: true,
        notes: 'Copiada de la estructura del país',
      });
      if (saved.status !== 'saved') {
        setError(saved.status === 'invalid' ? Object.values(saved.errors).join(' ') : saved.error.message);
        return;
      }
      const copied = await importRows(saved.structure.id, inherited.rows.map(toRowInput), 'replace');
      if (copied.error) { setError(copied.error); return; }
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setCopying(false);
    }
  };

  return { copying, handleCopyFromCountry };
}
