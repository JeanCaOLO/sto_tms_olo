import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { Company, Country, DispatchRoute } from '../types';

// Controller del Calendario de Rutas (FR1). Un solo load por país.
// El país sigue siendo el filtro de dato; la compañía es el selector visible
// en el header, igual que en el Motor de Reglas y el Panel OMS.
export function useRutasController() {
  const country: Country = 'CR';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<string>('');
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([omsApi.getCompanies(), omsApi.getRoutes(country)])
      .then(([c, r]) => {
        if (cancelled) return;
        setCompanies(c);
        setCompany((prev) => prev || c[0]?.id || '');
        setRoutes(r);
      })
      .catch(() => { if (!cancelled) setError('No se pudo cargar el calendario de rutas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = routes.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${r.id} ${r.name}`.toLowerCase().includes(q);
  });

  return {
    country, companies, company, setCompany, routes: filtered, loading, error, query, setQuery,
  };
}
