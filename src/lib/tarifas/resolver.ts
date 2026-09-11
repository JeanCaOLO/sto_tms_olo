// ¿QUÉ reglas aplican? Deriva las variables del contexto, filtra las reglas cuya condición se
// cumple, y decide cuáles sobreviven al stacking (SUM/MAX/EXCLUSIVE) — pero no calcula cuánto
// suma cada una: eso es trabajo de evaluator.ts. MAX necesita "cuánto" para decidir "cuál", así
// que acá se usa evaluateExpr solo como sonda de comparación, nunca para la traza final.
// Puerto literal de vista-tarifas-fase1/src/kernel/resolver.ts.

import type { EvalContext } from './evaluator';
import { evaluateExpr, evaluatePred } from './evaluator';
import { ZERO } from './money';
import type { CalculateInput, DiscardedRule, Rule, Stage, VarBag, Zone, ZoneGroup } from './types';
import { STAGE_ORDER } from './types';

export { evaluatePred };

// ── 1. Derivación de variables ────────────────────────────────────────────────────────────────

export interface DerivedContext {
  vars: VarBag;
  originZoneId: string;
  destZoneId: string;
  /** Igual a vars.overnightNights, pero tipado number (VarBag es string|number) para cost.ts/index.ts. */
  overnightNights: number;
}

function findOrThrow<T>(items: T[], pred: (item: T) => boolean, message: string): T {
  const found = items.find(pred);
  if (!found) throw new Error(message);
  return found;
}

function zoneGroupCode(zone: Zone, zoneGroups: ZoneGroup[]): string {
  return findOrThrow(
    zoneGroups,
    (g) => g.id === zone.zoneGroupId,
    `Grupo de zona no encontrado para la zona "${zone.code}" (zoneGroupId=${zone.zoneGroupId})`,
  ).code;
}

// Noches de pernocta: 0 mientras la duración no exceda el umbral del país (el borde exacto NO es
// pernocta, por eso <=), y a partir de ahí una noche por cada bloque completo del umbral.
export function computeOvernightNights(durationHours: number, overnightThresholdHours: number): number {
  if (overnightThresholdHours <= 0) return 0;
  if (durationHours <= overnightThresholdHours) return 0;
  return Math.floor(durationHours / overnightThresholdHours);
}

// getUTCDay() sobre una fecha que entra como parámetro (quotedAt): 0=domingo..6=sábado.
export function computeWeekday(quotedAtIso: string): number {
  return new Date(quotedAtIso).getUTCDay();
}

export function deriveContext(
  input: Pick<CalculateInput, 'trip' | 'country' | 'zones' | 'zoneGroups' | 'locations'>,
): DerivedContext {
  const { trip, country, zones, zoneGroups, locations } = input;

  const originLocation = findOrThrow(
    locations, (l) => l.id === trip.originLocationId,
    `Localidad de origen no encontrada: ${trip.originLocationId}`,
  );
  const destLocation = findOrThrow(
    locations, (l) => l.id === trip.destLocationId,
    `Localidad de destino no encontrada: ${trip.destLocationId}`,
  );
  const originZone = findOrThrow(
    zones, (z) => z.id === originLocation.zoneId,
    `Zona no encontrada para la localidad "${originLocation.code}"`,
  );
  const destZone = findOrThrow(
    zones, (z) => z.id === destLocation.zoneId,
    `Zona no encontrada para la localidad "${destLocation.code}"`,
  );

  const overnightNights = computeOvernightNights(trip.durationHours, country.overnightThresholdHours);

  const vars: VarBag = {
    countryId: trip.countryId,
    km: trip.km,
    clientCount: trip.clientCount,
    packageCount: trip.packageCount,
    weightKg: trip.weightKg,
    truckTypeId: trip.truckTypeId,
    serviceType: trip.serviceType,
    fleetType: trip.fleetType,
    carrierId: trip.carrierId ?? '',
    customerId: trip.customerId ?? '',
    durationHours: trip.durationHours,
    tollsAmount: trip.tollsAmount,
    lateMinutes: trip.lateMinutes,
    incidentCount: trip.incidentCount,
    originZone: originZone.code,
    destZone: destZone.code,
    originZoneGroup: zoneGroupCode(originZone, zoneGroups),
    destZoneGroup: zoneGroupCode(destZone, zoneGroups),
    overnightNights,
    weekday: computeWeekday(trip.quotedAt),
  };

  return { vars, originZoneId: originZone.id, destZoneId: destZone.id, overnightNights };
}

// ── 2-5. Filtrado, orden y stacking ────────────────────────────────────────────────────────────

export interface ResolveResult {
  /** Reglas que sobreviven, ya ordenadas por (stage, priority): listas para evaluator.ts. */
  applied: Rule[];
  discarded: DiscardedRule[];
}

// Contexto "sonda" para decidir el ganador de un grupo MAX: no tiene acceso a subtotales reales
// (todavía no existen en esta fase) ni a montos de otras reglas. Simplificación deliberada: una
// regla dentro de un exclusionGroup con stacking MAX no debería depender de
// RUNNING_SUBTOTAL/STAGE_SUBTOTAL/RULE para decidir su propio monto, porque se compara ANTES de
// que exista el pipeline de cargo real.
function probeContext(
  vars: VarBag,
  originZoneId: string,
  destZoneId: string,
  input: Pick<CalculateInput, 'zoneLaneRates'>,
): EvalContext {
  return {
    vars,
    originZoneId,
    destZoneId,
    zoneLaneRates: input.zoneLaneRates,
    getStageSubtotal: () => ZERO,
    getRunningSubtotal: () => ZERO,
    getRuleAmount: () => null,
    warn: () => {
      // silenciado: la evaluación real (runChargePipeline) vuelve a pasar por esta expresión y
      // emite el warning correspondiente una sola vez.
    },
  };
}

function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function resolveRules(
  input: Pick<
    CalculateInput,
    'trip' | 'country' | 'rules' | 'adhocRules' | 'zones' | 'zoneGroups' | 'locations' | 'zoneLaneRates'
  >,
  derived: DerivedContext,
): ResolveResult {
  const allRules = [...input.rules, ...(input.adhocRules ?? [])].filter(
    (r) => r.countryId === input.trip.countryId,
  );

  const discarded: DiscardedRule[] = [];
  const matched: Rule[] = [];

  for (const rule of allRules) {
    if (!rule.active) {
      discarded.push({ ruleCode: rule.code, reason: 'INACTIVE', detail: 'La regla está inactiva.' });
      continue;
    }
    if (!evaluatePred(rule.conditions, derived.vars)) {
      discarded.push({
        ruleCode: rule.code,
        reason: 'CONDITION_FALSE',
        detail: 'La condición de la regla no se cumplió con el contexto actual.',
      });
      continue;
    }
    matched.push(rule);
  }

  const winners: Rule[] = [];

  for (const stage of STAGE_ORDER) {
    const inStage = matched.filter((r) => r.stage === stage);

    const sumRules = inStage.filter((r) => r.stacking === 'SUM');
    winners.push(...sumRules);

    // EXCLUSIVE: compite contra las demás EXCLUSIVE de la misma etapa, gana la de menor priority.
    const exclusiveRules = inStage.filter((r) => r.stacking === 'EXCLUSIVE');
    if (exclusiveRules.length > 0) {
      const sorted = [...exclusiveRules].sort((a, b) => a.priority - b.priority);
      const winner = sorted[0]!;
      winners.push(winner);
      for (const loser of sorted.slice(1)) {
        discarded.push({
          ruleCode: loser.code,
          reason: 'EXCLUDED_BY_EXCLUSIVE',
          detail: `Excluida por "${winner.code}" (menor priority en la etapa ${stage}).`,
        });
      }
    }

    // MAX: compite dentro de cada exclusionGroup, gana el monto mayor.
    const maxRules = inStage.filter((r) => r.stacking === 'MAX');
    const groups = new Map<string, Rule[]>();
    for (const rule of maxRules) {
      const key = rule.exclusionGroup ?? `__singleton__${rule.id}`;
      const group = groups.get(key) ?? [];
      group.push(rule);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.length === 1) {
        winners.push(group[0]!);
        continue;
      }
      const withAmounts = group.map((rule) => ({
        rule,
        amount: evaluateExpr(
          rule.expression,
          probeContext(derived.vars, derived.originZoneId, derived.destZoneId, input),
        ),
      }));
      const winner = withAmounts.reduce((best, curr) => (curr.amount.greaterThan(best.amount) ? curr : best));
      winners.push(winner.rule);
      for (const { rule } of withAmounts) {
        if (rule.id !== winner.rule.id) {
          discarded.push({
            ruleCode: rule.code,
            reason: 'LOST_MAX',
            detail: `Perdió el MAX del grupo "${rule.exclusionGroup}" frente a "${winner.rule.code}".`,
          });
        }
      }
    }
  }

  const applied = winners.sort((a, b) => {
    const stageDiff = stageIndex(a.stage) - stageIndex(b.stage);
    return stageDiff !== 0 ? stageDiff : a.priority - b.priority;
  });

  return { applied, discarded };
}
