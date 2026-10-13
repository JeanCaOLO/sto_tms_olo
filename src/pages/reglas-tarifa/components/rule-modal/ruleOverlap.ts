// Aviso de regla repetida: otra regla activa con el mismo código y alcance cuya vigencia se pisa con la nueva.
//
// No es un bloqueo: las versiones de una regla comparten código (R_DIESEL v1 hasta el 30-sep, v2 desde el
// 1-oct) y eso es válido mientras sus vigencias no se solapen. Solo se avisa para evitar un duplicado accidental.

import type { Row } from '../../../../lib/tarifas/data';

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
  const [aFrom, aTo, bFrom, bTo] = [text(a.effective_from), text(a.effective_to), text(b.effective_from), text(b.effective_to)];
  const empiezaDespues = aTo !== null && bFrom !== null && aTo < bFrom;
  const terminaAntes = bTo !== null && aFrom !== null && bTo < aFrom;
  return !empiezaDespues && !terminaAntes;
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
