// Datos que el Probador necesita del país: países, escenarios, viajes completados, compañías y camiones.

import { useCallback, useEffect, useState } from 'react';
import { loadCountries } from '../../../../lib/tarifas/catalogLoader';
import { listCarrierProfiles } from '../../../../lib/tarifas/partiesDataSource';
import { listTruckTypes, type TruckTypeOption } from '../../../../lib/tarifas/vehiclesDataSource';
import { listTrips } from '../../../../lib/tarifas/tripsDataSource';
import { listTemplates } from '../../../../lib/tarifas/localRulesDataSource';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import type { TripRecord } from '../../../../lib/tarifas/types';
import { mensajeDe } from './testerTypes';

interface Params {
  organizationId: string;
  countryId: string;
  setCountryId: (update: (prev: string) => string) => void;
  setError: (message: string) => void;
}

export function useTesterBase({ organizationId, countryId, setCountryId, setError }: Params) {
  const [cargando, setCargando] = useState(true);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [carriers, setCarriers] = useState<CarrierProfile[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [truckTypes, setTruckTypes] = useState<TruckTypeOption[]>([]);
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const paises = await loadCountries();
      setCountries(paises.map((c) => ({ id: c.id, name: c.name })));
      setCountryId((prev) => prev || paises[0]?.id || '');
      setTemplates(await listTemplates(organizationId) as Record<string, unknown>[]);
    } catch (e) {
      console.error('Error cargando el probador:', e);
      setError(mensajeDe(e, 'No se pudieron cargar los países ni los escenarios.'));
    } finally {
      setCargando(false);
    }
  }, [organizationId, setCountryId, setError]);

  useEffect(() => { void recargar(); }, [recargar]);

  useEffect(() => {
    if (!countryId) return;
    let vigente = true;
    setLoadingTrips(true);
    void (async () => {
      try {
        const [t, c, trucks] = await Promise.all([
          listTrips({ countryId, status: 'completed' }),
          listCarrierProfiles({ countryId }),
          listTruckTypes(),
        ]);
        if (!vigente) return;
        setTrips(t);
        setCarriers(c);
        setTruckTypes(trucks);
      } catch (e) {
        console.error('Error cargando viajes del probador:', e);
        if (vigente) setError(mensajeDe(e, 'No se pudieron cargar los viajes del país.'));
      } finally {
        if (vigente) setLoadingTrips(false);
      }
    })();
    return () => { vigente = false; };
  }, [countryId, setError]);

  return { cargando, countries, carriers, trips, loadingTrips, truckTypes, templates, setTemplates, recargar };
}
