import { useCallback, useEffect, useState } from 'react';
import { fetchZones } from '../api/reglasTarifaApi';
import type { ZoneRow } from '../types';

export function useZones(organizationId: string) {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [cancelledRef] = useState({ value: false });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const zonesData = await fetchZones(organizationId);
      if (!cancelledRef.value) {
        setZones(zonesData);
      }
    } catch (error) {
      if (!cancelledRef.value) {
        console.error('Error cargando zonas:', error);
        setLoadError('No se pudieron cargar las zonas. Reintentá en unos segundos.');
      }
    } finally {
      if (!cancelledRef.value) {
        setLoading(false);
      }
    }
  }, [organizationId, cancelledRef]);

  useEffect(() => {
    cancelledRef.value = false;
    if (organizationId) {
      void load();
    }
    return () => { cancelledRef.value = true; };
  }, [load, organizationId, cancelledRef]);

  return { zones, loading, loadError, load };
}
