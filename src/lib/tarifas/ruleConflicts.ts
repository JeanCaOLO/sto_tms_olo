// Conflictos entre reglas: dos reglas que se pisan o hacen lo mismo. Una sola fuente de verdad para el
// motor (resolver) y para el aviso del modal de reglas, así no pueden desfasarse.
//
//   MISMO_CODIGO  mismo código, país y compañía, ambas activas y con vigencia solapada. Si las dos aplican,
//                 se cobran dos veces (y `ruleAmounts` del pipeline, que se indexa por código, se pisa).
//   MISMA_LOGICA  distinto código pero igual fase, condición y fórmula en el mismo alcance: el mismo cargo
//                 escrito dos veces (el domingo cobraría 20 % + 20 %).
//   MISMO_NOMBRE  distinto código y mismo nombre: en pantalla son indistinguibles.
//
// El alcance se compara aparte: una regla de compañía con el código de una de país NO es un conflicto,
// es la sobrescritura prevista (`OVERRIDDEN_BY_PARTY`).

export type RuleConflictKind = 'MISMO_CODIGO' | 'MISMA_LOGICA' | 'MISMO_NOMBRE';

/** Lo mínimo que hace falta de una regla para compararla (sirve tanto al dominio como a una fila de BD). */
export interface ComparableRule {
  id?: string | null;
  code: string;
  name: string;
  stage: string;
  stacking?: string | null;
  countryId?: string | null;
  scope?: string | null;
  partyId?: string | null;
  active: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  conditions: unknown;
  expression: unknown;
}

export interface RuleConflict {
  kind: RuleConflictKind;
  /** Códigos de las reglas involucradas (sin repetir). */
  codes: string[];
  message: string;
}

const norm = (s: string) => s.trim().toUpperCase();
const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** JSON con las claves ordenadas: dos fórmulas iguales escritas con otro orden de claves dan el mismo texto. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Vigencias 'YYYY-MM-DD' con ambos extremos inclusivos; nulo o vacío = sin límite por ese lado. */
export function vigenciasSePisan(
  a: { effectiveFrom?: string | null; effectiveTo?: string | null },
  b: { effectiveFrom?: string | null; effectiveTo?: string | null },
): boolean {
  const [aFrom, aTo, bFrom, bTo] = [a.effectiveFrom || null, a.effectiveTo || null, b.effectiveFrom || null, b.effectiveTo || null];
  return !(aTo !== null && bFrom !== null && aTo < bFrom) && !(bTo !== null && aFrom !== null && bTo < aFrom);
}

function sameOwner(a: ComparableRule, b: ComparableRule): boolean {
  return (a.countryId ?? null) === (b.countryId ?? null)
    && (a.scope ?? 'COUNTRY') === (b.scope ?? 'COUNTRY')
    && (a.partyId ?? null) === (b.partyId ?? null);
}

/** Qué tipo de conflicto hay entre dos reglas, o null. Ambas deben estar activas y vigentes a la vez. */
export function classifyConflict(a: ComparableRule, b: ComparableRule): RuleConflictKind | null {
  if (a === b || (a.id != null && a.id === b.id)) return null;
  if (!a.active || !b.active || !sameOwner(a, b) || !vigenciasSePisan(a, b)) return null;
  if (norm(a.code) === norm(b.code)) {
    // "Gana una sola" (EXCLUSIVE): solo cobra una, no hay doble cobro.
    return a.stacking === 'EXCLUSIVE' && b.stacking === 'EXCLUSIVE' ? null : 'MISMO_CODIGO';
  }
  if (a.stage === b.stage && canonical(a.conditions) === canonical(b.conditions) && canonical(a.expression) === canonical(b.expression)) {
    return 'MISMA_LOGICA';
  }
  return nameKey(a.name) === nameKey(b.name) ? 'MISMO_NOMBRE' : null;
}

const MESSAGES: Record<RuleConflictKind, (codes: string) => string> = {
  MISMO_CODIGO: (c) => `Hay más de una regla activa con el código ${c}, del mismo alcance y vigentes a la vez: si las dos aplican, se cobran dos veces.`,
  MISMA_LOGICA: (c) => `Las reglas ${c} hacen lo mismo (misma fase, condición y fórmula): el cargo se cobraría dos veces. Dejá una sola.`,
  MISMO_NOMBRE: (c) => `Las reglas ${c} tienen el mismo nombre con distinto código: en pantalla no se pueden distinguir.`,
};

/** Todos los conflictos dentro de un conjunto de reglas (un par por tipo, sin repetir). */
export function findRuleConflicts(rules: readonly ComparableRule[]): RuleConflict[] {
  const seen = new Set<string>();
  const out: RuleConflict[] = [];
  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const kind = classifyConflict(rules[i]!, rules[j]!);
      if (!kind) continue;
      const codes = [...new Set([rules[i]!.code, rules[j]!.code])].sort();
      const key = `${kind}|${codes.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind, codes, message: MESSAGES[kind](codes.join(', ')) });
    }
  }
  return out;
}
