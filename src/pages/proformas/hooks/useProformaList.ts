import { useCallback, useEffect, useState } from 'react';
import { assignPendingSettlements, listProformas, type ProformaWithPhases } from '../../../lib/tarifas/proformas';

/**
 * Proformas del país. Con `sweep`, antes de leer agrupa las liquidaciones en Borrador que quedaron sin
 * proforma (las generó antes de que hubiera fases, o antes de esta función): así nada se queda esperando.
 */
export function useProformaList(countryId: string, sweep: boolean) {
  const [rows, setRows] = useState<ProformaWithPhases[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!countryId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      if (sweep) {
        const swept = await assignPendingSettlements(countryId);
        if (swept.error) setError(`No se pudieron agrupar algunas liquidaciones: ${swept.error}`);
      }
      setRows(await listProformas(countryId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las proformas.');
    } finally {
      setLoading(false);
    }
  }, [countryId, sweep]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, error, reload };
}
