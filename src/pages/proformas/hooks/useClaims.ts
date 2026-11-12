import { useCallback, useEffect, useRef, useState } from 'react';
import { listClaimRows, type ClaimRow, type DateRange } from '../../../lib/tarifas/proformas';

/** Reclamos vigentes (abiertos o apelados) del país en el rango. Con `enabled` en false no consulta. */
export function useClaims(countryId: string, range: DateRange, enabled: boolean) {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0); // solo vale la respuesta de la última carga (ver useProformaList)

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    if (!countryId || !enabled) { setRows([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await listClaimRows(countryId, range);
      if (mine === seq.current) setRows(data);
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : 'No se pudieron cargar los reclamos.');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [countryId, range, enabled]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, error, reload };
}
