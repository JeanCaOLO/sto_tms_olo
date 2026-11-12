import { useEffect, useMemo, useState } from 'react';
import { loadIrregularities, type ProformaAlerts } from '../../../lib/tarifas/proformas';

/**
 * Alertas de irregularidad de las proformas visibles. Se piden una vez por conjunto de proformas (no por fila).
 * Mientras carga, o si falla, no hay alertas: quien revisa igual puede abrir cada proforma.
 */
export function useIrregularities(proformaIds: string[]): { alerts: Map<string, ProformaAlerts>; loading: boolean; failed: boolean } {
  const key = useMemo(() => [...proformaIds].sort().join(','), [proformaIds]);
  const [alerts, setAlerts] = useState<Map<string, ProformaAlerts>>(new Map());
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!key) { setAlerts(new Map()); return; }
    setLoading(true);
    setFailed(false);
    loadIrregularities(key.split(','))
      .then((result) => { if (!cancelled) setAlerts(result); })
      .catch(() => { if (!cancelled) { setAlerts(new Map()); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key]);

  return { alerts, loading, failed };
}
