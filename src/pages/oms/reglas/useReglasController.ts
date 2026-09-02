import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { PriorityRule } from '../types';

// Controller del Motor de Reglas (FR5). Carga perfiles y reglas; toggle local.
export function useReglasController() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [rules, setRules] = useState<PriorityRule[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([omsApi.getProfiles(), omsApi.getRules()])
      .then(([p, r]) => {
        if (cancelled) return;
        setProfiles(p);
        setRules(r);
        setActiveProfile(p[0] ?? '');
      })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar las reglas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const [modalOpen, setModalOpen] = useState(false);

  const toggleRule = (id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r)));
  };

  // Alta de regla local (mock, sin backend): agrega la fila al perfil activo.
  const addRule = (rule: Omit<PriorityRule, 'id' | 'profile'>) => {
    setRules((prev) => [
      ...prev,
      { ...rule, id: `R-${Date.now()}`, profile: activeProfile },
    ]);
    setModalOpen(false);
  };

  const rulesInProfile = rules.filter((r) => r.profile === activeProfile);

  return {
    profiles, activeProfile, setActiveProfile, rulesInProfile, loading, error,
    toggleRule, modalOpen, setModalOpen, addRule,
  };
}
