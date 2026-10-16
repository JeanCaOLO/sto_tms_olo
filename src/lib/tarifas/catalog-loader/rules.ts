// Carga de reglas de tarificación y política de margen.

import { db, type Row } from '../data';
import { toDecimal } from '../money';
import type { MarginPolicy, Rule } from '../types';

const eq = (column: string, value: unknown) => ({ column, op: 'eq' as const, value });

async function loadRules(countryId: string): Promise<Rule[]> {
  // También las inactivas: el resolver las descarta con su motivo, y una regla inactiva de compañía
  // es la forma de apagar para ella una regla del país.
  // OR no existe en `Where` (todo es AND): dos consultas en paralelo, país + globales, en vez de
  // traer las reglas de todos los países y descartar el resto en el cliente.
  const [ofCountry, global] = await Promise.all([
    db().find('pricingRule', RULES_OF_COUNTRY(countryId)),
    db().find('pricingRule', RULES_GLOBAL),
  ]);
  return buildRules(ofCountry, global, countryId);
}

export const RULES_OF_COUNTRY = (countryId: string) => ({ where: [eq('country_id', countryId)] });
export const RULES_GLOBAL = { where: [{ column: 'country_id', op: 'isNull' as const }] };

export function buildRules(ofCountry: Row[], global: Row[], countryId: string): Rule[] {
  return [...ofCountry, ...global]
    .map((row) => ({
      id: row.id,
      // `country_id` nulo = regla global: se estampa el país actual, porque el resolver filtra por
      // país exacto y si no quedaría fuera de todos.
      countryId: (row.country_id as string | null) ?? countryId,
      code: row.code,
      name: row.name,
      stage: row.stage,
      priority: Number(row.priority),
      stacking: row.stacking,
      scope: (row.scope ?? 'COUNTRY'),
      partyId: row.party_id ?? null,
      exclusionGroup: row.exclusion_group ?? null,
      conditions: row.conditions,
      expression: row.expression,
      description: row.description ?? null,
      reason: row.reason ?? null,
      effect: row.effect ?? null,
      builder: row.builder ?? null,
      effectiveFrom: row.effective_from ?? null,
      effectiveTo: row.effective_to ?? null,
      isAdhoc: !!row.is_adhoc,
      active: !!row.active,
      version: Number(row.version ?? 1),
    }));
}

async function loadMarginPolicy(countryId: string): Promise<MarginPolicy | null> {
  const [row] = await db().find('marginPolicy', { where: [eq('country_id', countryId)], limit: 1 });
  return buildMarginPolicy(row, countryId);
}

export function buildMarginPolicy(row: Row | undefined, countryId: string): MarginPolicy | null {
  if (!row) return null;
  return {
    countryId,
    warnBelow: toDecimal(String(row.warn_below)).toFixed(),
    criticalBelow: toDecimal(String(row.critical_below)).toFixed(),
    requireReasonBelow: toDecimal(String(row.require_reason_below)).toFixed(),
    blockOnLoss: !!row.block_on_loss,
  };
}

export async function loadRulesAndPolicy(
  countryId: string,
): Promise<{ rules: Rule[]; marginPolicy: MarginPolicy | null }> {
  const [rules, marginPolicy] = await Promise.all([
    loadRules(countryId),
    loadMarginPolicy(countryId),
  ]);
  return { rules, marginPolicy };
}
