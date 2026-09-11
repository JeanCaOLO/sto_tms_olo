import { useEffect, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchViajesDespachados } from './viajes-api';
import type { Pais } from './eflow-api';
import type { Viaje } from './types';

// `pais` es una dependencia: al cambiar de país se recarga desde el otro
// servidor EFLOW (el país activo lo lee eflow-api de su estado de módulo).
export function useViajes(appUser: AppUser | null, pais: Pais = 'cr') {
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [cargandoViajes, setCargandoViajes] = useState(false);

  useEffect(() => {
    if (!appUser) return;
    setCargandoViajes(true);
    fetchViajesDespachados()
      .then(setViajes)
      .catch((error) => console.error('Error cargando viajes:', error))
      .finally(() => setCargandoViajes(false));
  }, [appUser, pais]);

  return { viajes, cargandoViajes };
}
