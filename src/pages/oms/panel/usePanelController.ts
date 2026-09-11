import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { Country, OmsAlert, PriorityTier } from '../types';

// Controller del Panel OMS (FR4). Un solo load por país; estados loading/error.
export function usePanelController() {
  const [country, setCountry] = useState<Country>('CR');
  const [kpis, setKpis] = useState<{ pendientes: number; vencidos: number; overridePct: number; sinRuta: number } | null>(null);
  const [alerts, setAlerts] = useState<OmsAlert[]>([]);
  const [distribution, setDistribution] = useState<{ tier: PriorityTier; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([omsApi.getKpis(country), omsApi.getAlerts(country), omsApi.getTierDistribution(country)])
      .then(([k, a, d]) => {
        if (cancelled) return;
        setKpis(k);
        setAlerts(a);
        setDistribution(d);
      })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar los datos del motor.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  return { country, setCountry, kpis, alerts, distribution, loading, error };
}
