// Acciones sobre varias reglas a la vez. No hay operación de lote en el backend: se aplica una por una,
// cada cambio con su bitácora, y se informa cuáles fallaron sin detener a las demás.

import { deleteRuleWithAudit, setRuleActiveWithAudit, type RuleDeleteResult } from './reglasTarifaApi';
import type { RuleRow } from '../types';

export type BulkAction = 'activate' | 'deactivate' | 'delete';

export interface BulkFailure {
  rule: RuleRow;
  message: string;
}

export interface BulkOutcome {
  done: RuleRow[];
  failed: BulkFailure[];
}

function failureMessage(action: BulkAction, result: RuleDeleteResult): string {
  if (result.error?.code === '23503') return 'está referenciada en liquidaciones existentes.';
  return result.error?.message || (action === 'delete' ? 'no se pudo eliminar.' : 'no se pudo guardar.');
}

export async function runBulkRules(
  action: BulkAction,
  rules: RuleRow[],
  ctx: { organizationId: string; userName: string },
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { done: [], failed: [] };
  for (const rule of rules) {
    try {
      const result = action === 'delete'
        ? await deleteRuleWithAudit(rule.id, rule, ctx.userName)
        : await setRuleActiveWithAudit(ctx.organizationId, rule, action === 'activate', ctx.userName);
      if (result.ok) outcome.done.push(rule);
      else outcome.failed.push({ rule, message: failureMessage(action, result) });
    } catch (error) {
      outcome.failed.push({ rule, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcome;
}

/** Texto del resultado para el usuario: «Se desactivaron 2 de 3. R_X: está referenciada…». */
export function bulkSummary(action: BulkAction, total: number, outcome: BulkOutcome): string {
  const verbo = action === 'delete' ? 'eliminaron' : action === 'activate' ? 'activaron' : 'desactivaron';
  const head = `Se ${verbo} ${outcome.done.length} de ${total} regla${total === 1 ? '' : 's'}.`;
  if (outcome.failed.length === 0) return head;
  return `${head} ${outcome.failed.map((f) => `${f.rule.code}: ${f.message}`).join(' ')}`;
}
