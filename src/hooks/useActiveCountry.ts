// Hook del país activo del tarifador.
//
// Carga los países del módulo una sola vez y expone cuál está activo. Vive en `hooks/` y no dentro
// de `lib/tarifas/` porque es la única parte de esto que depende de React; la lógica de resolución
// y persistencia es pura y está en `lib/tarifas/activeCountry.ts`.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  getActiveCountryId, resolveActiveCountry, setActiveCountryId, subscribeActiveCountry,
} from '../lib/tarifas/activeCountry';
import { listCountries } from '../lib/tarifas/localRulesDataSource';

export interface TarifasCountry {
  id: string;
  iso2: string;
  name: string;
  local_currency: string;
}

export interface ActiveCountryState {
  countries: TarifasCountry[];
  /** País activo ya resuelto. null solo si el módulo no tiene ningún país configurado. */
  country: TarifasCountry | null;
  countryId: string;
  loading: boolean;
  setCountry: (countryId: string) => void;
  reload: () => Promise<void>;
}

export function useActiveCountry(): ActiveCountryState {
  const [countries, setCountries] = useState<TarifasCountry[]>([]);
  const [loading, setLoading] = useState(true);

  // El id guardado es estado externo al árbol de React: se sincroniza para que todas las pantallas
  // abiertas reaccionen al mismo cambio sin pasarse props entre ellas.
  const storedId = useSyncExternalStore(subscribeActiveCountry, getActiveCountryId, getActiveCountryId);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCountries((await listCountries('')) as TarifasCountry[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const country = resolveActiveCountry(countries, storedId);

  // Si el guardado no existe (primera vez, o lo borraron), se fija el resuelto para que el resto del
  // módulo lea siempre un país concreto en vez de un null que cada pantalla interprete a su manera.
  useEffect(() => {
    if (country && country.id !== storedId) setActiveCountryId(country.id);
  }, [country, storedId]);

  return {
    countries,
    country,
    countryId: country?.id ?? '',
    loading,
    setCountry: setActiveCountryId,
    reload,
  };
}
