import {
  deleteRule, listRules, listZones,
} from '../../../lib/tarifas/localRulesDataSource';
import { listCarrierProfiles } from '../../../lib/tarifas/partiesDataSource';
import { registrarEventoSeguro } from '../../../lib/liquidador/auditLog';
import { getActorRole } from '../../../lib/tarifas/actor';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import type { RuleRow, ZoneRow } from '../types';

// Capa de API fina sobre datasources de reglas y zonas.

export interface RuleDeleteResult {
  ok: boolean;
  error?: { code?: string; message: string };
}

export async function fetchRulesAndParties(organizationId: string): Promise<{ parties: CarrierProfile[]; rules: RuleRow[] }> {
  const [profilesResult, rulesResult] = await Promise.all([
    listCarrierProfiles({ includeInactive: true }),
    listRules(organizationId),
  ]);
  return { parties: profilesResult, rules: rulesResult as RuleRow[] };
}

// `listZones` trae el nombre del grupo de cada zona (`zone_groups`): lo usan los tarifarios.
export async function fetchZones(organizationId: string): Promise<ZoneRow[]> {
  return (await listZones(organizationId)) as ZoneRow[];
}

export async function deleteRuleWithAudit(
  ruleId: string,
  rule: RuleRow,
  userName: string,
): Promise<RuleDeleteResult> {
  const { error } = await deleteRule(ruleId);
  if (error) {
    return { ok: false, error };
  }
  await registrarEventoSeguro({
    entidad: 'pricing_rules',
    entidadId: ruleId,
    accion: 'DELETE',
    usuario: userName,
    rol: getActorRole(),
    antes: rule,
    despues: null,
  });
  return { ok: true };
}
