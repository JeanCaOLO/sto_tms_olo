import { useCallback, useEffect, useState } from 'react';
import { listProformas, type ProformaWithPhases } from '../../../lib/tarifas/proformas';

export function useProformaList(countryId: string) {
  const [rows, setRows] = useState<ProformaWithPhases[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!countryId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      setRows(await listProformas(countryId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las proformas.');
    } finally {
      setLoading(false);
    }
  }, [countryId]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, error, reload };
}
