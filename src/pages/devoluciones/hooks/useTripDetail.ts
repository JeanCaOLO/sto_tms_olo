// Detalle de un viaje (devoluciones, paradas y formulario). Se carga al abrir el viaje y se refresca tras recibir.
import { useCallback, useEffect, useState } from 'react';
import type { TripDetail } from '../../../lib/devoluciones/types';
import { getTrip } from '../api/devolucionesApi';

export function useTripDetail(routeId: string | null) {
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!routeId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTrip(routeId)
      .then((next) => { if (!cancelled) setDetail(next); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el viaje'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [routeId, version]);

  return { detail, loading, error, reload };
}
