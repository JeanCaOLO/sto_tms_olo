import { useCallback, useEffect, useRef, useState } from 'react';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import { fetchRulesAndParties } from '../api/reglasTarifaApi';
import type { RuleRow } from '../types';

export function useRulesAndParties(organizationId: string) {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [parties, setParties] = useState<CarrierProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Solo vale la respuesta de la última carga: al cambiar de organización (o recargar tras guardar) la
  // respuesta anterior que llega tarde se descarta. El "cancelado" anterior se reiniciaba en cada efecto.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      setLoading(true);
      setLoadError('');
      const { parties: partiesData, rules: rulesData } = await fetchRulesAndParties(organizationId);
      if (mine === seq.current) {
        setParties(partiesData);
        setRules(rulesData);
      }
    } catch (error) {
      if (mine === seq.current) {
        console.error('Error cargando reglas:', error);
        setLoadError('No se pudieron cargar las reglas. Reintentá en unos segundos.');
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) void load();
    // Al cambiar de organización o desmontar, lo que siga en vuelo deja de valer.
    return () => { seq.current += 1; };
  }, [load, organizationId]);

  return { rules, parties, loading, loadError, load };
}
