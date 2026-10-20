import { useCallback, useEffect, useState } from 'react';
import {
  decideProforma, getProformaDetail, setItemIncluded,
  type DecisionInput, type ProformaDetail,
} from '../../../lib/tarifas/proformas';

/** Carga el detalle de una proforma y ofrece las acciones que lo cambian; cada una recarga al terminar. */
export function useProformaDetail(proformaId: string, onChanged: () => void) {
  const [detail, setDetail] = useState<ProformaDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setDetail(await getProformaDetail(proformaId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la proforma.');
    }
  }, [proformaId]);

  useEffect(() => { void reload(); }, [reload]);

  const run = useCallback(async (work: () => Promise<{ error: string | null }>) => {
    setBusy(true);
    setError(null);
    const result = await work();
    if (result.error) setError(result.error);
    else { await reload(); onChanged(); }
    setBusy(false);
    return !result.error;
  }, [reload, onChanged]);

  const decide = useCallback((input: DecisionInput) => run(() => decideProforma(proformaId, input)), [run, proformaId]);

  const toggleItem = useCallback((settlementId: string, included: boolean, reason: string | null) => {
    if (!detail) return Promise.resolve(false);
    const { proforma, phases, items } = detail;
    return run(() => setItemIncluded(proforma, phases, items, settlementId, included, reason));
  }, [detail, run]);

  /** Recarga el detalle y avisa a la lista (cuando algo cambió por fuera de `decide`/`toggleItem`). */
  const refresh = useCallback(async () => { await reload(); onChanged(); }, [reload, onChanged]);

  return { detail, error, busy, decide, toggleItem, refresh };
}
