import { saveStructure } from '../../../lib/tarifas/costStructureDataSource';
import { ensurePartyProfile } from '../../../lib/tarifas/partiesDataSource';
import type { CostStructure } from '../../../lib/tarifas/types';
import type { StructureCtx } from './costStructureContext';

/** Asegura que existan el perfil de la compañía y, si hace falta, su estructura de costos propia. */
export function useStructureTarget(ctx: StructureCtx) {
  const { party, partyId, setPartyId, structure, meta, setError, onProfileCreated } = ctx;

  // null = no se pudo crear el perfil (el error ya quedó mostrado). Solo avisa si el perfil se creó.
  const ensureParty = async (): Promise<string | null> => {
    if (partyId) return partyId;
    const profile = await ensurePartyProfile(party?.carrierId ?? '');
    if (profile.status === 'failed') { setError(profile.error.message); return null; }
    setPartyId(profile.partyId);
    if (profile.created) onProfileCreated?.();
    return profile.partyId;
  };

  const ensureStructure = async (): Promise<CostStructure | null> => {
    if (structure) return structure;
    const targetId = await ensureParty();
    if (targetId === null) return null;

    const result = await saveStructure({
      partyId: targetId,
      countryId: party?.countryId ?? '',
      name: meta.name,
      operatingDaysPerMonth: meta.operatingDaysPerMonth,
      effectiveFrom: null,
      active: true,
      notes: null,
    });

    if (result.status !== 'saved') {
      setError(result.status === 'invalid' ? Object.values(result.errors).join(' ') : result.error.message);
      return null;
    }
    return result.structure;
  };

  return { ensureParty, ensureStructure };
}
