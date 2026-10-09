import { useEffect, useState } from 'react';
import { loadZones } from '../../../lib/tarifas/catalogLoader';

export function useCountryZones(countryId: string | undefined, loadingCountries: boolean) {
  const [zonas, setZonas] = useState<{ id: string; code: string; name: string }[]>([]);

  useEffect(() => {
    if (loadingCountries) return undefined;
    let cancelled = false;
    loadZones(countryId)
      .then((list) => {
        if (!cancelled) setZonas(list.map((z) => ({ id: z.id, code: z.code, name: z.name })));
      })
      .catch(() => { if (!cancelled) setZonas([]); });
    return () => { cancelled = true; };
  }, [countryId, loadingCountries]);

  return zonas;
}
