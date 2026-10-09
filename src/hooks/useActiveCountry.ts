// País activo del tarifador: el MISMO que el selector global del TMS (barra superior).
//
// Antes el módulo tenía su propio selector, guardado aparte, y se podía estar en un país arriba y en
// otro adentro. Ahora no hay selector propio: se lee el país global, se cruza con la lista de países
// del tarifador (misma tabla `countries`, mismo id) y con los países que el rol puede ver.
//
// Con "Todos los países" no hay país activo: el tarifador liquida en una moneda y un redondeo por
// país, así que mezclar países en una misma lista daría totales sin sentido. Las pantallas piden
// elegir uno.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listCountries } from '../lib/tarifas/localRulesDataSource';
import { useOperationalContext } from './useOperationalContext';
import { usePermissions } from './usePermissions';

export interface TarifasCountry {
  id: string;
  iso2: string;
  name: string;
  local_currency: string;
  /** Configuración de cálculo (redondeo, pernocta). Nula = el país existe pero no se puede liquidar aún. */
  settings_id?: string | null;
}

/** Por qué no hay un país con el que trabajar. */
export type CountryProblem =
  /** "Todos los países" en el selector global. */
  | 'none-selected'
  /** El país elegido no está entre los que el tarifador conoce o el rol puede ver. */
  | 'not-available'
  /** El país existe pero no tiene configuración de cálculo. */
  | 'not-configured'
  | null;

export interface ActiveCountryState {
  countries: TarifasCountry[];
  /** País activo ya resuelto; null si no hay uno utilizable (ver `problem`). */
  country: TarifasCountry | null;
  countryId: string;
  /** Nombre del país elegido en el selector global, aunque el tarifador no lo tenga. */
  selectedName: string | null;
  problem: CountryProblem;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useActiveCountry(): ActiveCountryState {
  const ctx = useOperationalContext();
  const { countries: permitted, loading: loadingPermissions } = usePermissions();
  const [countries, setCountries] = useState<TarifasCountry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadingList(true);
    setLoadError(null);
    try {
      setCountries((await listCountries('')) as TarifasCountry[]);
    } catch (e) {
      console.error('Error cargando países del tarifador:', e);
      setCountries([]);
      setLoadError(e instanceof Error ? e.message : 'Error al cargar países');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return useMemo(() => {
    const visible = permitted.all ? countries : countries.filter((c) => permitted.ids.includes(c.id));
    const selected = ctx.countries.find((c) => c.id === ctx.selectedCountryId) ?? null;
    // Mismo id en Aurora; por código en la semilla local (demo), cuyos ids no son los del TMS.
    const match = selected
      ? visible.find((c) => c.id === selected.id || c.iso2 === selected.code) ?? null
      : null;

    // Mientras los permisos cargan, `permitted` viene vacío y ningún país parece "visible": sin esperar
    // acá se mostraba un falso "no está disponible en el tarifador" durante varios segundos.
    const loading = loadingList || ctx.loading || loadingPermissions;
    let problem: CountryProblem = null;
    if (!loading) {
      if (!ctx.selectedCountryId) problem = 'none-selected';
      else if (!match) problem = 'not-available';
      else if (match.settings_id === null) problem = 'not-configured';
    }

    return {
      countries: visible,
      country: problem === 'none-selected' || problem === 'not-available' ? null : match,
      countryId: problem === 'none-selected' || problem === 'not-available' ? '' : match?.id ?? '',
      selectedName: selected?.name ?? null,
      problem,
      loading,
      reload,
    };
  }, [countries, ctx.countries, ctx.selectedCountryId, ctx.loading, loadingList, loadingPermissions, permitted, reload]);
}
