// La estructura de costos POR DEFECTO del país (`partyId = null`): la base de toda compañía de
// flota propia que no tenga la suya. Se carga y se refresca tras subir la plantilla.

import { useCallback, useEffect, useState } from 'react';
import { activeStructure, listRows } from '../../../lib/tarifas/costStructureDataSource';
import { summarize } from '../../../lib/tarifas/costTemplate';
import type { CostStructure, CostStructureRow } from '../../../lib/tarifas/types';

export function useCountryCostStructure(countryId: string) {
  const [loading, setLoading] = useState(true);
  const [structure, setStructure] = useState<CostStructure | null>(null);
  const [rows, setRows] = useState<CostStructureRow[]>([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!countryId) {
      setStructure(null);
      setRows([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const active = await activeStructure(null, countryId);
        const activeRows = active ? await listRows(active.id) : [];
        if (cancelled) return;
        setStructure(active);
        setRows(activeRows);
      } catch (e) {
        if (cancelled) return;
        console.error('Error cargando la estructura del país:', e);
        setError('No se pudo cargar la estructura de costos del país. Reintentá en unos segundos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [countryId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const summary = structure
    ? summarize(rows.filter((r) => r.active), structure.params, structure.operatingDaysPerMonth)
    : [];

  return { loading, structure, rows, summary, error, reload };
}
