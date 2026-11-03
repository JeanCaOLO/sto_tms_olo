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
  // "Cargar más" en vuelo: un segundo clic antes de que responda agregaba la misma página dos veces.
  const cargandoMasRef = useRef(false);

  const loadSettlements = useCallback(async () => {
    if (!countryId) { setSettlements([]); setLoadingSettlements(false); return; }
    setLoadingSettlements(true);
    const seq = ++requestSeq.current;
    // Una recarga (otro filtro o país) invalida cualquier "cargar más" que siga en vuelo.
    cargandoMasRef.current = false;
    setCargandoMas(false);
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
    if (!countryId || !siguiente || cargandoMasRef.current) return;
    cargandoMasRef.current = true;
    setCargandoMas(true);
    // Si mientras tanto cambia el filtro (`loadSettlements` sube el contador), la respuesta es del
    // filtro anterior y se descarta: mezclarla mostraría filas que ya no corresponden.
    const seq = requestSeq.current;
    try {
      const page = await fetchSettlementsPage({ countryId, from, to }, siguiente);
      if (seq !== requestSeq.current) return;
      setSettlements((actuales) => [...actuales, ...page.rows]);
      setSiguiente(page.next);
    } catch (e) {
      if (seq === requestSeq.current) {
        setError(e instanceof Error ? e.message : 'No se pudieron leer más liquidaciones.');
      }
    } finally {
      if (seq === requestSeq.current) {
        cargandoMasRef.current = false;
        setCargandoMas(false);
      }
    }
  };

  return { settlements, loadingSettlements, siguiente, cargandoMas, loadSettlements, loadMore };
}
