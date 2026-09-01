import { useEffect, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchCatalogos, type Catalogos } from './catalogos-api';

const EMPTY: Catalogos = { rutas: [], vehiculos: [], transportistas: [], conductores: [] };

export function useCatalogos(appUser: AppUser | null) {
  const [catalogos, setCatalogos] = useState<Catalogos>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appUser) return;
    setLoading(true);
    fetchCatalogos()
      .then(setCatalogos)
      .catch((error) => console.error('Error cargando catálogos:', error))
      .finally(() => setLoading(false));
  }, [appUser]);

  return { ...catalogos, loading };
}
