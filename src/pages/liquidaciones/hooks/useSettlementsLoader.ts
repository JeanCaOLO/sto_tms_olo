// Historial de liquidaciones: carga por páginas (las más recientes primero) y "cargar más antiguas".

import { useCallback, useRef, useState } from 'react';
import { fetchSettlementsPage } from '../api/liquidacionesApi';
import type { SettlementCursor } from '../../../lib/tarifas/settlementsDataSource';
import type { SettlementRecord } from '../../../lib/tarifas/types';

export function useSettlementsLoader(
  countryId: string | null,
  from: string,
  to: string,
  setError: (message: string) => void,
) {
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(true);
  // `siguiente` es el cursor de la próxima página; null = no hay más.
  const [siguiente, setSiguiente] = useState<SettlementCursor | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const requestSeq = useRef(0);

  const loadSettlements = useCallback(async () => {
    if (!countryId) { setSettlements([]); setLoadingSettlements(false); return; }
    setLoadingSettlements(true);
    const seq = ++requestSeq.current;
    try {
      const page = await fetchSettlementsPage({ countryId, from, to });
      if (seq === requestSeq.current) { setSettlements(page.rows); setSiguiente(page.next); }
    } catch (e) {
      if (seq === requestSeq.current) {
        setSettlements([]);
        setSiguiente(null);
        setError(e instanceof Error ? e.message : 'No se pudo leer el historial de liquidaciones.');
      }
    } finally {
      if (seq === requestSeq.current) setLoadingSettlements(false);
    }
  }, [countryId, from, to, setError]);

  const loadMore = async () => {
    if (!countryId || !siguiente) return;
    setCargandoMas(true);
    try {
      const page = await fetchSettlementsPage({ countryId, from, to }, siguiente);
      setSettlements((actuales) => [...actuales, ...page.rows]);
      setSiguiente(page.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer más liquidaciones.');
    } finally {
      setCargandoMas(false);
    }
  };

  return { settlements, loadingSettlements, siguiente, cargandoMas, loadSettlements, loadMore };
}
