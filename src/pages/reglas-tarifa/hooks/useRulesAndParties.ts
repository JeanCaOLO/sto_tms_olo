import { useCallback, useEffect, useState } from 'react';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import { fetchRulesAndParties } from '../api/reglasTarifaApi';
import type { RuleRow } from '../types';

export function useRulesAndParties(organizationId: string) {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [parties, setParties] = useState<CarrierProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [cancelledRef] = useState({ value: false });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const { parties: partiesData, rules: rulesData } = await fetchRulesAndParties(organizationId);
      if (!cancelledRef.value) {
        setParties(partiesData);
        setRules(rulesData);
      }
    } catch (error) {
      if (!cancelledRef.value) {
        console.error('Error cargando reglas:', error);
        setLoadError('No se pudieron cargar las reglas. Reintentá en unos segundos.');
      }
    } finally {
      if (!cancelledRef.value) {
        setLoading(false);
      }
    }
  }, [organizationId, cancelledRef]);

  useEffect(() => {
    cancelledRef.value = false;
    if (organizationId) {
      void load();
    }
    return () => { cancelledRef.value = true; };
  }, [load, organizationId, cancelledRef]);

  return { rules, parties, loading, loadError, load };
}
