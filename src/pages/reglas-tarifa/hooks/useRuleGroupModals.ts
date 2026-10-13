// Estado del modal de regla (cuál está abierto y sobre qué fila).

import { useState } from 'react';
import type { RuleRow } from '../types';

export function useRuleGroupModals() {
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<RuleRow | null>(null);
  return { isRuleModalOpen, setIsRuleModalOpen, selectedRule, setSelectedRule };
}
