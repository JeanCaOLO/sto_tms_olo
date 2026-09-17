// ¿QUÉ reglas aplican? Deriva las variables del contexto, filtra las reglas cuya condición se
// cumple, resuelve el alcance (país + compañía) y decide el stacking — salvo MAX, que necesita
// saber "cuánto" para decidir "cuál" y por eso viaja entero hasta `runChargePipeline`, donde los
// montos reales ya existen.
//
// El orden de salida es TOTAL y determinista (etapa, prioridad, alcance, código): dos reglas
// empatadas ya no se aplican en el orden en que las devolvió la base.

import { evaluatePred, RuleShapeError } from './evaluator';
import type {
  CalculateInput, DiscardedRule, PartyVariable, PartyVehicleType, Rule, Stage, VarBag, VarValue,
  Zone, ZoneGroup,
} from './types';
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

/**
 * Valor de cada variable personalizada declarada por la compañía.
 * - CONSTANT: el valor configurado en la declaración, igual para todos sus viajes.
 * - PER_TRIP: lo que se cargó en ESTE viaje; si no se cargó nada, el valor por defecto.
 *
 * Una variable declarada pero sin valor no rompe el cálculo: vale 0 (o vacío), y la regla que la
 * use simplemente no suma. Es la misma decisión que ya se tomó con las zonas sin asignar.
 */
export function resolveCustomVars(
  partyVariables: PartyVariable[],
  tripValues: Record<string, VarValue> | undefined,
): Record<string, VarValue> {
  const resolved: Record<string, VarValue> = {};

  for (const variable of partyVariables) {
    if (!variable.active) continue;

    const raw = variable.origin === 'PER_TRIP'
      ? tripValues?.[variable.key] ?? variable.defaultValue
      : variable.defaultValue;

    if (variable.kind === 'NUMBER') {
      const asNumber = Number(raw);
      resolved[variable.key] = Number.isFinite(asNumber) ? asNumber : 0;
    } else {
      resolved[variable.key] = raw === null || raw === undefined ? '' : String(raw);
    }
  }

  return resolved;
}

/**
 * Capacidad del camión del viaje: lo que venga cargado en el viaje manda, y si no vino, se busca en
 * el catálogo de la compañía por el código del tipo de camión.
 *
 * Ese orden es deliberado: el catálogo es la fuente normal —así nadie tiene que teclear los metros
 * cúbicos en cada liquidación— pero un viaje excepcional puede corregirlo sin tocar el catálogo.
 * Un valor en cero cuenta como "no informado", que es como llegan hoy los viajes reales.
 */
export function resolveTruckCapacity(
  truckTypeId: string,
  tripVolumeM3: number | undefined,
  tripWeightTons: number | undefined,
  catalog: PartyVehicleType[],
): { volumeM3: number; weightTons: number } {
  const tipo = catalog.find((t) => t.active && t.code === truckTypeId);

  return {
    volumeM3: tripVolumeM3 || tipo?.volumeM3 || 0,
    weightTons: tripWeightTons || tipo?.weightTons || 0,
  };
}

export function deriveContext(
  input: Pick<
    CalculateInput,
    'trip' | 'country' | 'zones' | 'zoneGroups' | 'locations' | 'partyVariables' | 'partyVehicleTypes'
  >,
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
    tollCount: trip.tollCount ?? 0,
    pickupCount: trip.pickupCount ?? 0,
    ...(() => {
      const capacidad = resolveTruckCapacity(
        trip.truckTypeId,
        trip.truckVolumeM3,
        trip.truckWeightTons,
        input.partyVehicleTypes ?? [],
      );
      return { truckVolumeM3: capacidad.volumeM3, truckWeightTons: capacidad.weightTons };
    })(),
    lateMinutes: trip.lateMinutes,
    incidentCount: trip.incidentCount,
    originZone: originZone.code,
    destZone: destZone.code,
    originZoneGroup: zoneGroupCode(originZone, zoneGroups),
    destZoneGroup: zoneGroupCode(destZone, zoneGroups),
    overnightNights,
    weekday: computeWeekday(trip.quotedAt),
    // Las personalizadas se agregan al final y con prefijo `custom:`, así que no pueden pisar
    // ninguna del sistema por más que alguien las nombre igual.
    ...resolveCustomVars(input.partyVariables ?? [], trip.customVars),
  };

  return { vars, originZoneId: originZone.id, destZoneId: destZone.id, overnightNights };
}

// ── 2-5. Filtrado, orden y stacking ────────────────────────────────────────────────────────────

export interface ResolveResult {
  /**
   * Reglas que sobreviven, en ORDEN TOTAL y determinista. Los grupos MAX viajan completos: quién
   * gana no se puede decidir acá porque depende de subtotales que todavía no existen — lo resuelve
   * `runChargePipeline` cuando llega a ellos, con los montos reales.
   */
  applied: Rule[];
  discarded: DiscardedRule[];
  warnings: string[];
}

function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

/** Una regla de compañía gana los empates contra una de país: es la más específica. */
function scopeRank(rule: Rule): number {
  return (rule.scope ?? 'COUNTRY') === 'PARTY' ? 0 : 1;
}

/**
 * Orden TOTAL: etapa, prioridad, alcance y finalmente código. El último criterio es lo que hace
 * que el resultado no dependa del orden en que la base devolvió las reglas — sin él, dos reglas
 * empatadas se aplicaban en el orden de llegada y un PERCENT sobre el subtotal acumulado daba
 * totales distintos para el MISMO viaje.
 */
function compareRules(a: Rule, b: Rule): number {
  const byStage = stageIndex(a.stage) - stageIndex(b.stage);
  if (byStage !== 0) return byStage;
  const byPriority = a.priority - b.priority;
  if (byPriority !== 0) return byPriority;
  const byScope = scopeRank(a) - scopeRank(b);
  if (byScope !== 0) return byScope;
  return a.code.localeCompare(b.code);
}

/**
 * ¿Rige esta regla el día del viaje?
 *
 * Ambos extremos son INCLUSIVOS y se comparan por DÍA, no por instante: un acuerdo que "vence el
 * 31 de agosto" cubre todo el 31, y un viaje de las 18:40 de ese día sigue adentro. Comparar el
 * timestamp completo contra `'2026-08-31'` lo dejaría afuera por unas horas.
 *
 * Las fechas vienen en `YYYY-MM-DD`, así que el orden lexicográfico ES el cronológico; no hace
 * falta construir `Date` (y con eso se evita el corrimiento de zona horaria que `new Date('...')`
 * introduce al interpretar una fecha pelada como UTC).
 *
 * Una regla sin fechas rige siempre: es el estado de todas las reglas escritas antes de que el
 * campo existiera.
 */
export function isRuleInEffect(
  rule: Pick<Rule, 'effectiveFrom' | 'effectiveTo'>,
  quotedAt: string,
): boolean {
  const day = quotedAt.slice(0, 10);
  if (rule.effectiveFrom && day < rule.effectiveFrom) return false;
  if (rule.effectiveTo && day > rule.effectiveTo) return false;
  return true;
}

function vigenciaDetail(rule: Rule, quotedAt: string): string {
  const day = quotedAt.slice(0, 10);
  if (rule.effectiveFrom && day < rule.effectiveFrom) {
    return `Rige desde el ${rule.effectiveFrom} y el viaje es del ${day}.`;
  }
  return `Rigió hasta el ${rule.effectiveTo} y el viaje es del ${day}.`;
}

export function resolveRules(
  input: Pick<
    CalculateInput,
    'trip' | 'country' | 'rules' | 'adhocRules' | 'zones' | 'zoneGroups' | 'locations'
  >,
  derived: DerivedContext,
): ResolveResult {
  const allRules = [...input.rules, ...(input.adhocRules ?? [])].filter(
    (r) => r.countryId === input.trip.countryId,
  );

  const discarded: DiscardedRule[] = [];

  // ── Alcance: país + compañía ────────────────────────────────────────────────────────────────
  // Las reglas de país son la base compartida. Las de la compañía del viaje se suman, y si repiten
  // el `code` de una de país la REEMPLAZAN. Un único mecanismo cubre heredar, agregar y
  // sobrescribir — incluida la reactivación, para una compañía, de una regla de país desactivada:
  // la compañía escribe su propia versión activa con ese mismo código.
  //
  // Las reglas de OTRAS compañías se descartan en silencio: no están "descartadas", están fuera de
  // alcance, y enumerarlas inflaría la traza (y el snapshot de la proforma) sin aportar nada.
  const partyId = input.trip.partyId ?? null;
  const isPartyScoped = (r: Rule) => (r.scope ?? 'COUNTRY') === 'PARTY';

  // La vigencia se resuelve ANTES que la sobrescritura, y el orden no es cosmético: una regla que
  // no rige el día del viaje tiene que comportarse como si no existiera para ese viaje. Si se
  // filtrara después, vencer la regla propia de una compañía la dejaría sin NINGUNA tarifa — la de
  // país seguiría descartada como "sobrescrita" por una regla que ya no aplica.
  //
  // Es distinto de desactivarla: una regla de compañía inactiva SÍ tapa la de país (es la forma de
  // apagar, para una compañía, algo que el país cobra). Vencer es el calendario; desactivar es una
  // decisión.
  const inEffect = (rules: Rule[]) => rules.filter((rule) => {
    // Una regla apagada sigue el camino de antes: se descarta más abajo como INACTIVE, que es la
    // explicación más útil (y la que ya esperaba el resto del módulo). Con esto, la vigencia solo
    // cambia el destino de las reglas ACTIVAS.
    if (!rule.active || isRuleInEffect(rule, input.trip.quotedAt)) return true;
    discarded.push({
      ruleCode: rule.code,
      reason: 'OUT_OF_PERIOD',
      detail: vigenciaDetail(rule, input.trip.quotedAt),
    });
    return false;
  });

  const partyRules = inEffect(
    allRules.filter((r) => isPartyScoped(r) && partyId !== null && r.partyId === partyId),
  );
  const overriddenCodes = new Set(partyRules.map((r) => r.code));

  const countryRules = inEffect(allRules.filter((r) => !isPartyScoped(r)));
  for (const rule of countryRules) {
    if (overriddenCodes.has(rule.code)) {
      discarded.push({
        ruleCode: rule.code,
        reason: 'OVERRIDDEN_BY_PARTY',
        detail: 'Reemplazada por la regla propia de la compañía con el mismo código.',
      });
    }
  }

  const inScope = [
    ...countryRules.filter((r) => !overriddenCodes.has(r.code)),
    ...partyRules,
  ];

  const matched: Rule[] = [];

  for (const rule of inScope) {
    if (!rule.active) {
      discarded.push({ ruleCode: rule.code, reason: 'INACTIVE', detail: 'La regla está inactiva.' });
      continue;
    }
    let aplica: boolean;
    try {
      aplica = evaluatePred(rule.conditions, derived.vars);
    } catch (e) {
      if (!(e instanceof RuleShapeError)) throw e;
      // Una condición ilegible no se puede leer ni como verdadera ni como falsa: la regla se
      // descarta NOMBRÁNDOLA, y el pipeline se encarga de frenar la emisión.
      discarded.push({
        ruleCode: rule.code,
        reason: 'RULE_BROKEN',
        detail: `No se pudo leer su condición: ${e.message}. Revisala en modo avanzado.`,
      });
      continue;
    }
    if (!aplica) {
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
  const warnings: string[] = [];

  for (const stage of STAGE_ORDER) {
    const inStage = matched.filter((r) => r.stage === stage);

    const sumRules = inStage.filter((r) => r.stacking === 'SUM');
    winners.push(...sumRules);

    // EXCLUSIVE: compite contra las demás EXCLUSIVE de la misma etapa, gana la de menor priority.
    const exclusiveRules = inStage.filter((r) => r.stacking === 'EXCLUSIVE');
    if (exclusiveRules.length > 0) {
      const sorted = [...exclusiveRules].sort(compareRules);
      const winner = sorted[0]!;
      winners.push(winner);
      for (const loser of sorted.slice(1)) {
        discarded.push({
          ruleCode: loser.code,
          reason: 'EXCLUDED_BY_EXCLUSIVE',
          detail: loser.priority === winner.code.length * 0 + winner.priority
            ? `Excluida por "${winner.code}", que tiene la misma prioridad pero es más específica (regla de compañía).`
            : `Excluida por "${winner.code}" (menor priority en la etapa ${stage}).`,
        });
      }
    }

    // MAX: los candidatos pasan COMPLETOS al pipeline. Antes se decidía acá con una sonda cuyos
    // subtotales valían cero, así que una regla basada en un porcentaje del acumulado siempre valía
    // 0 y perdía siempre, aunque en la realidad fuera la mayor. Quién gana solo se puede saber con
    // los montos reales, y esos existen recién durante el pipeline.
    winners.push(...inStage.filter((r) => r.stacking === 'MAX'));
  }

  // Un empate de prioridad ya no rompe el determinismo (el orden total lo resuelve por código),
  // pero sigue siendo señal de que alguien no decidió el orden a propósito.
  for (const stage of STAGE_ORDER) {
    const porPrioridad = new Map<number, Rule[]>();
    for (const rule of winners.filter((r) => r.stage === stage)) {
      porPrioridad.set(rule.priority, [...(porPrioridad.get(rule.priority) ?? []), rule]);
    }
    for (const [priority, empatadas] of porPrioridad) {
      if (empatadas.length > 1) {
        warnings.push(
          `En la etapa ${stage} hay ${empatadas.length} reglas con prioridad ${priority} ` +
          `(${empatadas.map((r) => r.code).join(', ')}). Se aplican en orden alfabético por código; ` +
          'si el orden importa para el resultado, asignales prioridades distintas.',
        );
      }
    }
  }

  const applied = winners.sort(compareRules);

  return { applied, discarded, warnings };
}
