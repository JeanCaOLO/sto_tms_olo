import { useCallback, useEffect, useRef, useState } from 'react';
import { assignPendingSettlements, listProformas, type DateRange, type ProformaScope, type ProformaWithPhases } from '../../../lib/tarifas/proformas';

/**
 * Proformas del país. Con `sweep`, la PRIMERA lectura de cada país agrupa antes las liquidaciones en Borrador que
 * quedaron sin proforma (las generó antes de que hubiera fases, o antes de esta función). El barrido lee todas las
 * liquidaciones del país: no se repite al recargar tras una decisión ni al cambiar de pestaña.
 * `scope`: 'active' trae solo lo vigente; 'all' el historial reciente; 'review' y 'done' las de En proceso y
 * Completadas, filtradas por `range`. Con `enabled` en false no consulta (la sección no está abierta).
 */
export function useProformaList(countryId: string, sweep: boolean, scope: ProformaScope, range?: DateRange, enabled = true) {
  const [rows, setRows] = useState<ProformaWithPhases[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noPhases, setNoPhases] = useState(false);
  const swept = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!countryId || !enabled) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      if (sweep && swept.current !== countryId) {
        swept.current = countryId;
        const result = await assignPendingSettlements(countryId);
        if (result.error) setError(`No se pudieron agrupar algunas liquidaciones: ${result.error}`);
        setNoPhases(result.skipped === 'no-phases');
      }
      setRows(await listProformas(countryId, scope, range));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las proformas.');
    } finally {
      setLoading(false);
    }
  }, [countryId, sweep, scope, range, enabled]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, error, noPhases, reload };
}
