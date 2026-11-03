import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { notify } from '../../../lib/notify';
import type { RuleRow } from '../types';

/**
 * Enlace desde el desglose de una liquidación (`?regla=ID`): abre esa regla. Si no existe avisa (antes el enlace se
 * descartaba en silencio) y solo se quita `regla` de la dirección: los demás parámetros se conservan.
 */
export function useRuleFromLink(
  rules: RuleRow[],
  onRuleFound: (rule: RuleRow) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const ruleFromLink = searchParams.get('regla');
  // El callback llega nuevo en cada render: por ref, para que no reejecute el efecto.
  const onFound = useRef(onRuleFound);
  useEffect(() => { onFound.current = onRuleFound; });

  useEffect(() => {
    if (!ruleFromLink || rules.length === 0) return;
    const found = rules.find((r) => r.id === ruleFromLink);
    if (found) onFound.current(found);
    else notify('La regla del enlace no existe o ya no está disponible.', 'warning');
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('regla');
      return next;
    }, { replace: true });
  }, [ruleFromLink, rules, setSearchParams]);
}
