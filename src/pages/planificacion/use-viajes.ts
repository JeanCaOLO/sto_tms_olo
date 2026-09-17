import { useEffect, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchViajesDespachados } from './viajes-api';
import type { Pais } from './eflow-api';
import type { Viaje } from './types';

// `pais` y `company` son dependencias: al cambiar cualquiera se recarga desde el
// servidor EFLOW (el país y la compañía activos los lee eflow-api de su estado).
export function useViajes(appUser: AppUser | null, pais: Pais = 'cr', company = '', demo = false) {
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [cargandoViajes, setCargandoViajes] = useState(false);

  useEffect(() => {
    if (!appUser) return;
    setCargandoViajes(true);
    fetchViajesDespachados()
      .then(setViajes)
      .catch((error) => console.error('Error cargando viajes:', error))
      .finally(() => setCargandoViajes(false));
  }, [appUser, pais, company, demo]);

  return { viajes, cargandoViajes };
}
