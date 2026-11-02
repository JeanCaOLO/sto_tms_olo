// Decidir una fase de la proforma (aprobar, rechazar, quitar, reenviar) o anularla.
// Va por el endpoint del servidor: ahí se valida quién puede decidir. El navegador no escribe fases ni estado.

import { apiFetch } from '../../supabase';

export type DecisionAction = 'approve' | 'reject' | 'skip' | 'resubmit' | 'annul' | 'appeal' | 'restart';

export interface DecisionInput {
  action: DecisionAction;
  phaseId?: string;
  comment?: string;
}

export async function decideProforma(proformaId: string, input: DecisionInput): Promise<{ error: string | null }> {
  try {
    const res = await apiFetch(`/tarifas/proformas/${encodeURIComponent(proformaId)}/decision`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (res.ok) return { error: null };
    return { error: res.body.error?.message ?? `No se pudo registrar la decisión (${res.status}).` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
