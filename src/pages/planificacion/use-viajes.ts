import { useEffect, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchViajesDespachados } from './viajes-api';
import type { Viaje } from './types';

export function useViajes(appUser: AppUser | null) {
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [cargandoViajes, setCargandoViajes] = useState(false);

  useEffect(() => {
    if (!appUser) return;
    setCargandoViajes(true);
    fetchViajesDespachados()
      .then(setViajes)
      .catch((error) => console.error('Error cargando viajes:', error))
      .finally(() => setCargandoViajes(false));
  }, [appUser]);

  return { viajes, cargandoViajes };
}
