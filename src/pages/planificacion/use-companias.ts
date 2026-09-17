import { useEffect, useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { fetchCompanias, type Compania, type Pais } from './eflow-api';
import { fallbackCompanias } from './fallback-companias';

// Compañías del país activo. `pais` es dependencia: al cambiar recarga.
export function useCompanias(appUser: AppUser | null, pais: Pais, demo = false) {
  const [companias, setCompanias] = useState<Compania[]>(() => fallbackCompanias(pais));

  useEffect(() => {
    if (!appUser) return;
    let vivo = true;
    fetchCompanias(fallbackCompanias(pais)).then((c) => {
      if (vivo) setCompanias(c);
    });
    return () => {
      vivo = false;
    };
  }, [appUser, pais, demo]);

  return companias;
}
