import { useCallback, useState } from 'react';
import { getSettlement } from '../../../lib/tarifas/settlements/queryHelpers';
import type { SettlementRecord } from '../../../lib/tarifas/types';

/** Abre el desglose completo de UNA liquidación de la proforma: se lee al hacer clic, no antes. */
export function useSettlementDetail() {
  const [settlement, setSettlement] = useState<SettlementRecord | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (settlementId: string) => {
    setLoadingId(settlementId);
    setError(null);
    try {
      const found = await getSettlement(settlementId);
      if (found) setSettlement(found);
      else setError('No se encontró la liquidación.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la liquidación.');
    } finally {
      setLoadingId(null);
    }
  }, []);

  const close = useCallback(() => setSettlement(null), []);

  return { settlement, loadingId, error, open, close };
}
