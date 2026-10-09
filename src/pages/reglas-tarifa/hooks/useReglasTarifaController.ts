import { useState } from 'react';
import { useRulesAndParties } from './useRulesAndParties';
import { useZones } from './useZones';
import { useRuleDelete } from './useRuleDelete';
import { useRuleFromLink } from './useRuleFromLink';
import { useRuleGroupModals } from './useRuleGroupModals';
import { filterByCountry, filterByExactCountry } from '../parts/countryFilter';

export type Tab = 'reglas' | 'tarifarios' | 'margen' | 'probador' | 'bitacora';

interface UseReglasTarifaControllerProps {
  organizationId: string;
  countryId: string;
  userName: string;
  canDelete: boolean;
}

export function useReglasTarifaController({
  organizationId, countryId, userName, canDelete,
}: UseReglasTarifaControllerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('reglas');

  const {
    rules, parties, loading: loadingRules, loadError: rulesError, load: loadRules,
  } = useRulesAndParties(organizationId);
  const { zones, loading: loadingZones, loadError: zonesError } = useZones(organizationId);

  const modals = useRuleGroupModals();
  const ruleDelete = useRuleDelete();

  // Enlace desde el desglose de una liquidación: abre la regla indicada.
  useRuleFromLink(rules, (rule) => {
    setActiveTab('reglas');
    modals.setSelectedRule(rule);
    modals.setIsRuleModalOpen(true);
  });

  // El permiso real lo exige el backend; acá se evita ofrecer lo que no se puede.
  const handleDeleteRule = async () => {
    if (!canDelete) {
      ruleDelete.setRuleDeleteError('Tu rol no tiene permiso para eliminar reglas.');
      return;
    }
    await ruleDelete.handleDeleteRule(ruleDelete.ruleToDelete, userName, loadRules);
  };

  return {
    activeTab, setActiveTab,
    // Reglas sin país son globales y se muestran; las zonas son siempre de un país.
    rules: filterByCountry(rules, countryId),
    zones: filterByExactCountry(zones, countryId),
    parties, loadingRules, loadingZones, loadError: rulesError || zonesError,
    ...modals, ...ruleDelete,
    handleDeleteRule, loadRules,
  };
}
