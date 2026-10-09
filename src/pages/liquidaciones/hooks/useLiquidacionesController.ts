// State for settlements page (tab, dates, loading, KPIs, status changes).

import { useEffect, useMemo, useState } from 'react';
import { updateStatus } from '../api/liquidacionesApi';
import { tripProgress } from '../../../lib/tarifas/tripOrders';
import { computeKPIs } from './computeKPIs';
import { useRefreshOnReturn } from './useRefreshOnReturn';
import { useSettlementsLoader } from './useSettlementsLoader';
import { useTripRowActions } from './useTripRowActions';
import { useTripsLoader } from './useTripsLoader';
import type { SettlementRecord, SettlementStatus } from '../../../lib/tarifas/types';

export function useLiquidacionesController(countryId: string | null) {
  const [tab, setTab] = useState<'trips' | 'history'>('trips');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const tripsState = useTripsLoader(countryId, from, to, setError);
  const settlementsState = useSettlementsLoader(countryId, from, to, setError);
  const { trips, loadTrips } = tripsState;
  const { settlements, loadSettlements } = settlementsState;
  const rowActions = useTripRowActions(setError);

  const reloadAll = () => { void loadTrips(); void loadSettlements(); };
  const markLoaded = useRefreshOnReturn(reloadAll, [loadTrips, loadSettlements]);

  useEffect(() => {
    setError('');
    reloadAll();
    // `reloadAll` solo agrupa las dos cargas: se relee cuando cambia alguna de ellas (país o fechas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTrips, loadSettlements]);

  const changeStatus = async (s: SettlementRecord, status: SettlementStatus) => {
    const shouldCancel = status === 'Anulado' && !window.confirm(`¿Anular ${s.number}? Esta acción no se puede deshacer.`);
    if (shouldCancel) return;
    setError('');
    try {
      const { error: err } = await updateStatus(s.id, status);
      if (err) { setError(err); return; }
      await loadSettlements();
      if (status === 'Anulado') void loadTrips();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado de la liquidación.');
    }
  };

  const listos = useMemo(() => trips.filter((t) => t.status === 'completed' && tripProgress(t).complete), [trips]);
  const incompletos = useMemo(() => trips.filter((t) => !tripProgress(t).complete), [trips]);

  return {
    tab, setTab, from, setFrom, to, setTo, error, setError,
    ...tripsState, ...settlementsState, ...rowActions,
    reload: () => { markLoaded(); reloadAll(); },
    changeStatus, listos, incompletos,
    kpis: useMemo(() => computeKPIs(settlements), [settlements]),
  };
}
