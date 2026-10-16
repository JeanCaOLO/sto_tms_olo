// Aviso de regla repetida: otra regla activa con el mismo código y alcance cuya vigencia se pisa con la nueva.
//
// No es un bloqueo: las versiones de una regla comparten código (R_DIESEL v1 hasta el 30-sep, v2 desde el
// 1-oct) y eso es válido mientras sus vigencias no se solapen. Solo se avisa para evitar un duplicado accidental.

import type { Row } from '../../../../lib/tarifas/data';
import { classifyConflict, vigenciasSePisan as vigenciasSePisanLib, type ComparableRule, type RuleConflictKind } from '../../../../lib/tarifas/ruleConflicts';
import { normalizeStage } from '../../../../lib/tarifas/types';

interface RuleKey {
  code?: unknown;
  country_id?: unknown;
  party_id?: unknown;
  active?: unknown;
  effective_from?: unknown;
  effective_to?: unknown;
}

const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

/** Vigencias 'YYYY-MM-DD' con ambos extremos inclusivos; nulo = sin límite por ese lado. */
export function vigenciasSePisan(a: RuleKey, b: RuleKey): boolean {
  return vigenciasSePisanLib(
    { effectiveFrom: text(a.effective_from), effectiveTo: text(a.effective_to) },
    { effectiveFrom: text(b.effective_from), effectiveTo: text(b.effective_to) },
  );
}

/** Una fila de BD (snake_case) en la forma que compara `ruleConflicts`. */
function toComparable(r: Record<string, unknown>): ComparableRule {
  return {
    id: text(r.id), code: String(r.code ?? ''), name: String(r.name ?? ''), stage: normalizeStage(String(r.stage ?? '')),
    stacking: text(r.stacking), countryId: text(r.country_id), scope: text(r.scope), partyId: text(r.party_id),
    active: r.active === true, effectiveFrom: text(r.effective_from), effectiveTo: text(r.effective_to),
    conditions: r.conditions, expression: r.expression,
  };
}

/** Otra regla que hace lo mismo con otro código, o se llama igual: "misma lógica" / "mismo nombre". */
export function findSimilarRule(
  nueva: Record<string, unknown>, existentes: Row[], idPropio?: string,
): { rule: Row, kind: RuleConflictKind } | null {
  const mine = toComparable({ ...nueva, id: idPropio ?? nueva.id });
  for (const r of existentes) {
    const kind = classifyConflict(mine, toComparable(r));
    if (kind === 'MISMA_LOGICA' || kind === 'MISMO_NOMBRE') return { rule: r, kind };
  }
  return null;
}

/** La otra regla activa con el mismo código, país y compañía cuya vigencia se pisa con `nueva`; null si no hay. */
export function findOverlappingRule(nueva: RuleKey, existentes: Row[], idPropio?: string): Row | null {
  if (!nueva.active) return null;
  const code = String(nueva.code ?? '').trim().toUpperCase();
  return existentes.find((r) => (
    r.id !== idPropio
    && r.active === true
    && String(r.code ?? '').trim().toUpperCase() === code
    && (text(r.country_id) ?? null) === (text(nueva.country_id) ?? null)
    && (text(r.party_id) ?? null) === (text(nueva.party_id) ?? null)
    && vigenciasSePisan(nueva, r)
  )) ?? null;
}
