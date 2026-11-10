import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { Company, EngineRule } from '../types';

// Controller del Motor de Reglas (FR5) — catálogo de SOLO LECTURA (DECIDED 2026-11-05).
// El set de reglas es fijo en código; aquí solo se cargan y se filtran por compañía.
export function useReglasController() {
  const [rules, setRules] = useState<EngineRule[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([omsApi.getEngineRules(), omsApi.getCompanies()])
      .then(([r, c]) => {
        if (cancelled) return;
        setRules(r);
        setCompanies(c);
        setCompany(c[0]?.id ?? '');
      })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar las reglas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Reglas de la compañía seleccionada, ordenadas.
  const rulesForCompany = rules
    .filter((r) => r.company === company)
    .sort((a, b) => a.order - b.order);

  return { rules: rulesForCompany, companies, company, setCompany, loading, error };
}
