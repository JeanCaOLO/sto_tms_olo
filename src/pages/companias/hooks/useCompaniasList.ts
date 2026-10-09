import { useCallback, useEffect, useState } from 'react';
import { listCarrierProfiles, deactivateParty, reactivateParty } from '../../../lib/tarifas/partiesDataSource';
import type { CarrierProfile, PartyClassification } from '../../../lib/tarifas/parties';
import type { registrarEvento as registrarEventoFn } from '../../../lib/liquidador/auditLog';

export function useCompaniasList(classification: PartyClassification, countryId: string | undefined, loadingCountries: boolean) {
  const [profiles, setProfiles] = useState<CarrierProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setProfiles(await listCarrierProfiles({
        classification,
        countryId: countryId || undefined,
        includeInactive: true,
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [classification, countryId]);

  useEffect(() => { if (!loadingCountries) void load(); }, [load, loadingCountries]);

  const handleToggleStatus = useCallback(async (profile: CarrierProfile, usuarioActivo: string, getActorRole: () => string, registrarEvento: typeof registrarEventoFn): Promise<{ error: string | null }> => {
    if (!profile.partyId) return { error: null };
    const reactivating = profile.profileStatus === 'inactive';

    try {
      if (!reactivating) {
        const ok = window.confirm(
          `¿Desactivar el cálculo de "${profile.name}"?\n\nNo se borra: sale de los selectores pero las ` +
          `liquidaciones ya emitidas la conservan intacta, porque el histórico es inmutable. ` +
          `El transportista sigue en el catálogo.`,
        );
        if (!ok) return { error: null };
      }

      const result = reactivating
        ? await reactivateParty(profile.partyId)
        : await deactivateParty(profile.partyId);
      if (result.error) return { error: result.error.message };

      await registrarEvento({
        entidad: 'settlement_party',
        entidadId: profile.partyId,
        accion: 'UPDATE',
        usuario: usuarioActivo,
        rol: getActorRole(),
        antes: { status: profile.profileStatus },
        despues: { status: reactivating ? 'active' : 'inactive' },
        motivo: reactivating ? 'Reactivación' : 'Baja lógica',
      });
      await load();
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [load]);

  return { profiles, loading, loadError, handleToggleStatus, load };
}
