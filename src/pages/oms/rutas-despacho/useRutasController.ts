import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { Country, DispatchRoute } from '../types';

// Controller del Calendario de Rutas (FR1). Un solo load por país.
export function useRutasController() {
  const [country, setCountry] = useState<Country>('CR');
  const [routes, setRoutes] = useState<DispatchRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    omsApi.getRoutes(country)
      .then((r) => { if (!cancelled) setRoutes(r); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar el calendario de rutas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  const [modalOpen, setModalOpen] = useState(false);

  const filtered = routes.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${r.id} ${r.name}`.toLowerCase().includes(q);
  });

  // Alta de ruta local (mock, sin backend): agrega la fila al país activo.
  const addRoute = (route: Omit<DispatchRoute, 'country' | 'exceptions' | 'byAppointment'>) => {
    setRoutes((prev) => [
      { ...route, country, exceptions: 0, byAppointment: route.loadDays.length === 0 },
      ...prev,
    ]);
    setModalOpen(false);
  };

  return {
    country, setCountry, routes: filtered, loading, error, query, setQuery,
    modalOpen, setModalOpen, addRoute,
  };
}
