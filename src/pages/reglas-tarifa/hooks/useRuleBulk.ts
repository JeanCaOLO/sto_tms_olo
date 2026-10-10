// Acciones en lote sobre las reglas marcadas en la tabla: activar, desactivar y eliminar.

import { useState } from 'react';
import { bulkSummary, runBulkRules, type BulkAction } from '../api/bulkRules';
import { notify } from '../../../lib/notify';
import type { RuleRow } from '../types';

interface Props {
  organizationId: string;
  userName: string;
  canEdit: boolean;
  canDelete: boolean;
  reload: () => Promise<void>;
  onDone: () => void;
}

export function useRuleBulk({ organizationId, userName, canEdit, canDelete, reload, onDone }: Props) {
  const [toDelete, setToDelete] = useState<RuleRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const execute = async (action: BulkAction, rules: RuleRow[]) => {
    setBusy(true);
    try {
      const outcome = await runBulkRules(action, rules, { organizationId, userName });
      await reload();
      const summary = bulkSummary(action, rules.length, outcome);
      notify(summary, outcome.failed.length ? 'warning' : 'success');
      return outcome;
    } finally {
      setBusy(false);
    }
  };

  /** Activar/desactivar: una confirmación y listo. Eliminar abre su modal. */
  const start = async (action: BulkAction, rules: RuleRow[]) => {
    if (rules.length === 0) return;
    if (action === 'delete') {
      if (!canDelete) { notify('Tu rol no tiene permiso para eliminar reglas.', 'error'); return; }
      setError('');
      setToDelete(rules);
      return;
    }
    if (!canEdit) { notify('Tu rol no tiene permiso para modificar reglas.', 'error'); return; }
    const verbo = action === 'activate' ? 'Activar' : 'Desactivar';
    const efecto = action === 'activate'
      ? 'Empiezan a aplicarse en las liquidaciones nuevas.'
      : 'Dejan de aplicarse en las liquidaciones nuevas.';
    if (!window.confirm(`¿${verbo} ${rules.length} regla${rules.length === 1 ? '' : 's'}? ${efecto}`)) return;
    const outcome = await execute(action, rules);
    if (outcome.failed.length === 0) onDone();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setError('');
    const outcome = await execute('delete', toDelete);
    if (outcome.failed.length === 0) {
      setToDelete(null);
      onDone();
    } else {
      // Quedan abiertas solo las que fallaron, con el motivo, para decidir qué hacer.
      setToDelete(outcome.failed.map((f) => f.rule));
      setError(outcome.failed.map((f) => `${f.rule.code}: ${f.message}`).join(' '));
    }
  };

  return { toDelete, setToDelete, bulkError: error, bulkBusy: busy, startBulk: start, confirmBulkDelete: confirmDelete };
}
