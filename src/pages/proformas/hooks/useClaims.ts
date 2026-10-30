import { useCallback, useEffect, useState } from 'react';
import { listClaimRows, type ClaimRow, type DateRange } from '../../../lib/tarifas/proformas';

/** Reclamos vigentes (abiertos o apelados) del país en el rango. Con `enabled` en false no consulta. */
export function useClaims(countryId: string, range: DateRange, enabled: boolean) {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!countryId || !enabled) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      setRows(await listClaimRows(countryId, range));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los reclamos.');
    } finally {
      setLoading(false);
    }
  }, [countryId, range, enabled]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, error, reload };
}
