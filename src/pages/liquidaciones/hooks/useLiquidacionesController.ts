// State for settlements page (tab, dates, loading, KPIs, status changes).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPendingTrips, fetchSettlements, updateStatus } from '../api/liquidacionesApi';
import { tripProgress } from '../../../lib/tarifas/tripOrders';
import { computeKPIs } from './computeKPIs';
import type { SettlementRecord, SettlementStatus, TripRecord } from '../../../lib/tarifas/types';

export function useLiquidacionesController(countryId: string | null) {
  const [tab, setTab] = useState<'trips' | 'history'>('trips');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(true);
  const tripsRequestSeq = useRef(0);
  const settlementsRequestSeq = useRef(0);

  const loadTrips = useCallback(async () => {
    if (!countryId) { setTrips([]); setLoadingTrips(false); return; }
    setLoadingTrips(true);
    const seq = ++tripsRequestSeq.current;
    try {
      const data = await fetchPendingTrips({ countryId, from, to });
      if (seq === tripsRequestSeq.current) setTrips(data);
    } catch (e) {
      if (seq === tripsRequestSeq.current) {
        setTrips([]);
        setError(e instanceof Error ? e.message : 'No se pudieron leer los viajes por liquidar.');
      }
    } finally {
      if (seq === tripsRequestSeq.current) setLoadingTrips(false);
    }
  }, [countryId, from, to]);

  const loadSettlements = useCallback(async () => {
    if (!countryId) { setSettlements([]); setLoadingSettlements(false); return; }
    setLoadingSettlements(true);
    const seq = ++settlementsRequestSeq.current;
    try {
      const data = await fetchSettlements({ countryId, from, to });
      if (seq === settlementsRequestSeq.current) setSettlements(data);
    } catch (e) {
      if (seq === settlementsRequestSeq.current) {
        setSettlements([]);
        setError(e instanceof Error ? e.message : 'No se pudo leer el historial de liquidaciones.');
      }
    } finally {
      if (seq === settlementsRequestSeq.current) setLoadingSettlements(false);
    }
  }, [countryId, from, to]);

  useEffect(() => {
    setError('');
    void loadTrips();
    void loadSettlements();
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
    trips, loadingTrips, settlements, loadingSettlements,
    reload: () => { void loadTrips(); void loadSettlements(); },
    changeStatus, listos, incompletos,
    kpis: useMemo(() => computeKPIs(settlements), [settlements]),
  };
}
