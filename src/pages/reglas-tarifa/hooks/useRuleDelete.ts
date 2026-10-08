import { useState } from 'react';
import { deleteRuleWithAudit, type RuleDeleteResult } from '../api/reglasTarifaApi';
import type { RuleRow } from '../types';

export function useRuleDelete() {
  const [ruleToDelete, setRuleToDelete] = useState<RuleRow | null>(null);
  const [ruleDeleteError, setRuleDeleteError] = useState('');
  const [deletingRule, setDeletingRule] = useState(false);

  const handleDeleteRule = async (
    rule: RuleRow | null,
    userName: string,
    onSuccess: () => Promise<void>,
  ): Promise<boolean> => {
    if (!rule) return false;
    setRuleDeleteError('');
    if (!userName) {
      setRuleDeleteError('No se puede registrar la auditoría sin usuario.');
      return false;
    }
    setDeletingRule(true);
    try {
      const result: RuleDeleteResult = await deleteRuleWithAudit(
        rule.id,
        rule,
        userName,
      );
      if (!result.ok && result.error) {
        if (result.error.code === '23503') {
          setRuleDeleteError('No se puede eliminar: esta regla está referenciada en liquidaciones existentes.');
          return false;
        }
        setRuleDeleteError(result.error.message || 'Error al eliminar la regla.');
        return false;
      }
      await onSuccess();
      setRuleToDelete(null);
      return true;
    } catch (error) {
      console.error('Error al eliminar regla:', error);
      setRuleDeleteError('Ocurrió un error inesperado al intentar eliminar la regla.');
      return false;
    } finally {
      setDeletingRule(false);
    }
  };

  return {
    ruleToDelete,
    setRuleToDelete,
    ruleDeleteError,
    setRuleDeleteError,
    deletingRule,
    handleDeleteRule,
  };
}
