import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { CompanyConfig, EngineRule, PriorityTableRow, RuleParam } from '../types';

// Controller del Motor de Reglas (FR5) — catálogo semi-configurable.
// La lógica de cada regla vive en código; aquí solo se activa/desactiva,
// se ajusta el peso y sus parámetros, y se configura por compañía.
export function useReglasController() {
  const [rules, setRules] = useState<EngineRule[]>([]);
  const [companies, setCompanies] = useState<CompanyConfig[]>([]);
  const [priorityTable, setPriorityTable] = useState<PriorityTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([omsApi.getEngineRules(), omsApi.getCompanyConfigs(), omsApi.getPriorityTable()])
      .then(([r, c, p]) => {
        if (cancelled) return;
        setRules(r);
        setCompanies(c);
        setPriorityTable(p);
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

  const toggleCompany = (id: string) =>
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, prioritizes: !c.prioritizes } : c)));

  const editingRule = rules.find((r) => r.id === editingId) ?? null;

  return {
    rules, companies, priorityTable, loading, error,
    toggleRule, setWeight,
    editingId, setEditingId, editingRule, saveParams,
    toggleCompany,
  };
}
