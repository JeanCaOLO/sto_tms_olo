import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { Company, EngineRule, RuleParam } from '../types';

// Controller del Motor de Reglas (FR5) — catálogo semi-configurable.
// La lógica de cada regla vive en código; aquí solo se activa/desactiva,
// se ajusta el peso y sus parámetros. La lista se filtra por compañía.
export function useReglasController() {
  const [rules, setRules] = useState<EngineRule[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const toggleRule = (id: string) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r)));

  const setWeight = (id: string, weight: number) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, weight } : r)));

  const saveParams = (id: string, params: RuleParam[]) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, params } : r)));
    setEditingId(null);
  };

  // Reglas de la compañía seleccionada, ordenadas.
  const rulesForCompany = rules
    .filter((r) => r.company === company)
    .sort((a, b) => a.order - b.order);

  const editingRule = rules.find((r) => r.id === editingId) ?? null;

  return {
    rules: rulesForCompany, companies, company, setCompany, loading, error,
    toggleRule, setWeight,
    editingId, setEditingId, editingRule, saveParams,
  };
}
