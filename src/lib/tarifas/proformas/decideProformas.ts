// Decide (aprueba o rechaza) la fase actual de varias proformas, una por una. El servidor valida cada decisión
// por separado: si una falla, las demás siguen y el resultado dice cuáles no pasaron.

import { currentPhase } from './currentPhase';
import { decideProforma } from './decideProforma';
import type { ProformaWithPhases } from './proformaQueries';

export interface BulkDecisionResult {
  done: number;
  failed: { number: string; error: string }[];
}

export async function decideProformas(
  rows: ProformaWithPhases[],
  action: 'approve' | 'reject',
  comment?: string,
): Promise<BulkDecisionResult> {
  const result: BulkDecisionResult = { done: 0, failed: [] };
  for (const row of rows) {
    const phase = currentPhase(row.phases);
    if (!phase) {
      result.failed.push({ number: row.proforma.number, error: 'No tiene una fase pendiente.' });
      continue;
    }
    const { error } = await decideProforma(row.proforma.id, { action, phaseId: phase.id, comment });
    if (error) result.failed.push({ number: row.proforma.number, error });
    else result.done += 1;
  }
  return result;
}
