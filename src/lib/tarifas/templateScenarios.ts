// Plantillas de viaje como escenarios verificables.
//
// Una plantilla siempre sirvió para cargar un viaje de ejemplo con un click. Lo que le faltaba es
// la otra mitad: **cuánto tiene que dar**. Sin eso, una plantilla demuestra que el motor corre, no
// que sigue calculando lo mismo que ayer.
//
// Con `expectedTotal` cargado, un test recorre las plantillas y falla si el total se movió. Es la
// diferencia entre enterarse de un cambio de reglas al romperse el build y enterarse delante del
// cliente.
//
// Dónde vive el número: dentro del jsonb `trip`, junto al viaje, para no tocar el esquema. El motor
// ignora las claves que no conoce, así que conviven sin estorbarse — pero acá se separan en dos
// campos distintos apenas se lee la fila, porque una expectativa NO es un dato del viaje y mezclar
// las dos cosas es cómo se terminan calculando totales a partir de totales.
//
// Módulo PURO: no lee el ORM ni calcula. Recibe filas y devuelve escenarios; recibe un total y
// dice si coincide.

import { toDecimal } from './money';
import type { Money, ServiceType, TripContext } from './types';

/** Una fila de `pricingTemplate` tal como la devuelve la capa de datos. */
export interface TemplateRow {
  id?: string;
  country_id?: string;
  name?: string;
  trip?: Record<string, unknown> | null;
}

export interface TemplateScenario {
  id: string;
  name: string;
  countryId: string;
  /** El viaje completo, listo para `buildCalculateInput`. */
  trip: TripContext;
  /** Total que este escenario debe dar. `null` = plantilla sin verificación todavía. */
  expectedTotal: Money | null;
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v !== '' ? v : fallback);

const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * Completa un viaje guardado hasta un `TripContext` entero.
 *
 * Las plantillas viejas no traen `tollCount`, `pickupCount` ni capacidad del camión: esos campos no
 * existían cuando se guardaron. Rellenarlos con cero acá es lo correcto —una plantilla anterior a
 * las recolectas describe un viaje sin recolectas— y evita que cada pantalla invente sus propios
 * respaldos, que es como el Probador y la liquidación terminaron divergiendo.
 */
export function normalizeTrip(raw: Record<string, unknown> | null | undefined, countryId: string): TripContext {
  const t = raw ?? {};
  const fleetType = t.fleetType === 'OUTSOURCED' ? 'OUTSOURCED' : 'OWN';

  return {
    countryId: str(t.countryId, countryId),
    partyId: nullableStr(t.partyId),
    quotedAt: str(t.quotedAt as string, new Date().toISOString()),
    originLocationId: str(t.originLocationId, ''),
    destLocationId: str(t.destLocationId, ''),
    km: num(t.km, 0),
    clientCount: num(t.clientCount, 0),
    packageCount: num(t.packageCount, 0),
    weightKg: num(t.weightKg, 0),
    truckTypeId: str(t.truckTypeId, ''),
    serviceType: (t.serviceType as ServiceType) ?? 'STANDARD',
    fleetType,
    carrierId: nullableStr(t.carrierId),
    driverId: nullableStr(t.driverId),
    customerId: nullableStr(t.customerId),
    durationHours: num(t.durationHours, 0),
    tollsAmount: str(t.tollsAmount, '0'),
    tollCount: num(t.tollCount, 0),
    pickupCount: num(t.pickupCount, 0),
    truckVolumeM3: num(t.truckVolumeM3, 0),
    truckWeightTons: num(t.truckWeightTons, 0),
    lateMinutes: num(t.lateMinutes, 0),
    incidentCount: num(t.incidentCount, 0),
    ...(t.customVars && typeof t.customVars === 'object'
      ? { customVars: t.customVars as TripContext['customVars'] }
      : {}),
  };
}

/** Separa la expectativa del viaje. */
export function toScenario(row: TemplateRow): TemplateScenario {
  const countryId = row.country_id ?? '';
  const raw = row.trip ?? {};
  const esperado = raw.expectedTotal;

  return {
    id: row.id ?? '',
    name: row.name ?? '(sin nombre)',
    countryId,
    trip: normalizeTrip(raw, countryId),
    expectedTotal: typeof esperado === 'string' && esperado.trim() !== '' ? esperado : null,
  };
}

/** Vuelve a la forma de la fila, con la expectativa de nuevo adentro del jsonb. */
export function toTemplateRow(scenario: Omit<TemplateScenario, 'id'> & { id?: string }): TemplateRow {
  return {
    ...(scenario.id ? { id: scenario.id } : {}),
    country_id: scenario.countryId,
    name: scenario.name,
    trip: {
      ...scenario.trip,
      ...(scenario.expectedTotal ? { expectedTotal: scenario.expectedTotal } : {}),
    },
  };
}

// ── La verificación ───────────────────────────────────────────────────────────────────────────

export type ScenarioVerdict = 'OK' | 'MOVIO' | 'SIN_ESPERADO';

export interface ScenarioCheck {
  id: string;
  name: string;
  expected: Money | null;
  actual: Money;
  verdict: ScenarioVerdict;
  /** Diferencia con signo (actual − esperado). `null` si no hay esperado. */
  drift: Money | null;
}

/**
 * Compara por VALOR, no por texto: "100" y "100.00" son el mismo total.
 *
 * Comparar las cadenas marcaría como regresión un cambio de redondeo que no movió un centavo, y a
 * la tercera falsa alarma nadie vuelve a mirar el test.
 */
export function checkScenario(
  scenario: Pick<TemplateScenario, 'id' | 'name' | 'expectedTotal'>,
  actualTotal: Money,
): ScenarioCheck {
  const base = { id: scenario.id, name: scenario.name, expected: scenario.expectedTotal, actual: actualTotal };

  if (scenario.expectedTotal === null) {
    return { ...base, verdict: 'SIN_ESPERADO', drift: null };
  }

  const diferencia = toDecimal(actualTotal).minus(toDecimal(scenario.expectedTotal));
  return {
    ...base,
    verdict: diferencia.isZero() ? 'OK' : 'MOVIO',
    drift: diferencia.toFixed(),
  };
}

/** Un renglón legible para la pantalla y para el mensaje de un test rojo. */
export function describeCheck(check: ScenarioCheck): string {
  if (check.verdict === 'SIN_ESPERADO') {
    return `${check.name}: da ${check.actual}, pero la plantilla no declara un total esperado.`;
  }
  if (check.verdict === 'OK') return `${check.name}: ${check.actual} ✓`;
  return `${check.name}: esperaba ${check.expected} y dio ${check.actual} (diferencia ${check.drift}).`;
}
