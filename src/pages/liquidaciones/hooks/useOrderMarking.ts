// State for marking/unmarking trip orders (annul/defer/include).

import { useCallback, useState } from 'react';
import { setOrderMark } from '../../../lib/tarifas/tripsDataSource';
import type { OrderMark, TripOrder } from '../../../lib/tarifas/types';
import type { TripRecord } from '../../../lib/tarifas/types';

export function useOrderMarking(trip: Pick<TripRecord, 'id' | 'countryId'>) {
  const [annulling, setAnnulling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  /** ok = la marca se guardó; si no, `error` trae el motivo del servidor (o de la excepción) para mostrarlo. */
  const apply = useCallback(async (
    order: TripOrder,
    mark: OrderMark | null,
    why?: string,
  ): Promise<{ ok: boolean; error: string | null }> => {
    if (!order.orderId) return { ok: false, error: 'El pedido no tiene identificador: no se puede marcar.' };
    setBusy(true);
    try {
      const { error: err } = await setOrderMark({ trip, orderId: order.orderId, mark, reason: why });
      if (!err) {
        setAnnulling(null);
        setReason('');
        return { ok: true, error: null };
      }
      return { ok: false, error: typeof err === 'string' ? err : String((err as { message?: string }).message ?? err) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      setBusy(false);
    }
  }, [trip]);

  return {
    annulling,
    setAnnulling,
    reason,
    setReason,
    busy,
    apply,
  };
}
