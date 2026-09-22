import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { Company, Country, OmsAlert, PriorityTier } from '../types';

// Controller del Panel OMS (FR4). Un solo load por compañía; estados loading/error.
// El país sigue siendo el filtro de dato (FR4.4); la compañía es el selector visible
// en el header, igual que en el Motor de Reglas.
export function usePanelController() {
  const country: Country = 'CR';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<string>('');
  const [kpis, setKpis] = useState<{ pendientes: number; vencidos: number; overridePct: number; sinRuta: number } | null>(null);
  const [alerts, setAlerts] = useState<OmsAlert[]>([]);
  const [distribution, setDistribution] = useState<{ tier: PriorityTier; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([omsApi.getCompanies(), omsApi.getKpis(country), omsApi.getAlerts(country), omsApi.getTierDistribution(country)])
      .then(([c, k, a, d]) => {
        if (cancelled) return;
        setCompanies(c);
        setCompany((prev) => prev || c[0]?.id || '');
        setKpis(k);
        setAlerts(a);
        setDistribution(d);
      })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar los datos del motor.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { companies, company, setCompany, kpis, alerts, distribution, loading, error };
}
