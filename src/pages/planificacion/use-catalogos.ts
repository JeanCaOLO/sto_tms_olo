import { useEffect, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchCatalogos, type Catalogos } from './catalogos-api';
import type { Pais } from './eflow-api';

const EMPTY: Catalogos = { rutas: [], vehiculos: [], transportistas: [], conductores: [] };

// `pais` es dependencia: al cambiar recarga los catálogos del otro país.
export function useCatalogos(appUser: AppUser | null, pais: Pais = 'cr') {
  const [catalogos, setCatalogos] = useState<Catalogos>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser) return;
    setLoading(true);
    fetchCatalogos()
      .then(setCatalogos)
      .catch((error) => console.error('Error cargando catálogos:', error))
      .finally(() => setLoading(false));
  }, [appUser, pais]);

  return { ...catalogos, loading };
}
