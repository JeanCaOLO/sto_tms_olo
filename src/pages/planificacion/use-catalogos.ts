import { useEffect, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchCatalogos, type Catalogos } from './catalogos-api';
import type { Pais } from './eflow-api';

const EMPTY: Catalogos = { rutas: [], vehiculos: [], transportistas: [], conductores: [] };

// `pais` es dependencia: al cambiar recarga los catálogos del otro país.
export function useCatalogos(appUser: AppUser | null, pais: Pais = 'cr') {
  const [catalogos, setCatalogos] = useState<Catalogos>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appUser) return;
    setLoading(true);
    setError(null);
    fetchCatalogos()
      .then(setCatalogos)
      .catch((e) => {
        console.error('Error cargando catálogos:', e);
        setCatalogos(EMPTY);
        setError('No se pudieron cargar los catálogos (rutas, vehículos, conductores).');
      })
      .finally(() => setLoading(false));
  }, [appUser, pais]);

  return { ...catalogos, loading, error };
}
