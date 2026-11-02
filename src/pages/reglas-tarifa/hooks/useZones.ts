import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchZones } from '../api/reglasTarifaApi';
import type { ZoneRow } from '../types';

export function useZones(organizationId: string) {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const seq = useRef(0); // solo vale la respuesta de la última carga (ver useRulesAndParties)

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      setLoading(true);
      setLoadError('');
      const zonesData = await fetchZones(organizationId);
      if (mine === seq.current) setZones(zonesData);
    } catch (error) {
      if (mine === seq.current) {
        console.error('Error cargando zonas:', error);
        setLoadError('No se pudieron cargar las zonas. Reintentá en unos segundos.');
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) void load();
    return () => { seq.current += 1; };
  }, [load, organizationId]);

  return { zones, loading, loadError, load };
}
