// State for marking/unmarking trip orders (annul/defer/include).

import { useCallback, useState } from 'react';
import { setOrderMark } from '../../../lib/tarifas/tripsDataSource';
import type { OrderMark, TripOrder } from '../../../lib/tarifas/types';
import type { TripRecord } from '../../../lib/tarifas/types';

export function useOrderMarking(trip: Pick<TripRecord, 'id' | 'countryId'>) {
  const [annulling, setAnnulling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = useCallback(async (
    order: TripOrder,
    mark: OrderMark | null,
    why?: string,
  ) => {
    if (!order.orderId) return false;
    setBusy(true);
    try {
      const { error: err } = await setOrderMark({ trip, orderId: order.orderId, mark, reason: why });
      if (!err) {
        setAnnulling(null);
        setReason('');
        return true;
      }
      return false;
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
