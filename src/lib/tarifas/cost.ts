// Motor de costos. Deliberadamente NO es "una regla más" del lenguaje de reglas: el costo no se
// liquida al transportista, se calcula con su propio modelo y solo se usa para derivar el margen.
// Hay un solo modelo: la ESTRUCTURA de costos por filas (la de la compañía, o la del país para la
// flota propia).
//
// MONEDA: hay una sola por país, así que el costo y el total liquidado están siempre en la misma y
// el margen compara moneda contra la misma moneda por construcción.

import Decimal from 'decimal.js';
import type {
  BuiltinCostDriver, CalculateInput, CostBreakdown, CostDriver, CostStructure, CostStructureRow, Country,
  Stage, TraceLine, TraceSource, VarBag,
} from './types';
import { evaluatePred, RuleShapeError } from './evaluator';
import { addAll, roundToMoney, toDecimal } from './money';

// Un día por defecto, más uno por cada noche de pernocta ya derivada por el resolver.
function daysFor(overnightNights: number): number {
  return overnightNights + 1;
}

interface CostLine {
  code: string;
  label: string;
  amount: Decimal;
  inputs: Record<string, string | number>;
}

// CostBreakdown.breakdown reutiliza TraceLine (para que la UI pueda reusar el mismo componente de
// desglose que el de reglas), pero estas líneas no pertenecen al pipeline de cargo: no hay reglas,
// stage es un valor fijo sin significado de stacking, y runningSubtotal solo se acumula dentro del
// propio desglose de costo.
function toTraceLines(lines: CostLine[], country: Country, source: TraceSource): TraceLine[] {
  let running = new Decimal(0);
  const stage: Stage = 'BASE';
  return lines.map((line, index) => {
    running = running.plus(line.amount);
    const amount = roundToMoney(line.amount, country);
    return {
      seq: index + 1,
      stage,
      ruleId: null,
      ruleCode: line.code,
      label: line.label,
      inputs: line.inputs,
      source,
      computed: amount,
      final: amount,
      runningSubtotal: roundToMoney(running, country),
    };
  });
}

// ── Estructura de costos por filas ────────────────────────────────────────────────────────────

/**
 * Cuántas unidades le corresponden a una fila en ESTE viaje, según su driver. Es el único lugar
 * donde se decide qué significa "por km", "por día" o "mensual prorrateado" — y por eso es el único
 * lugar que hay que mirar cuando un costo no da lo esperado.
 *
 * Un driver `custom:*` es una variable numérica de la compañía ("peajes", "bultos"): sus unidades
 * son el valor que tiene en este viaje.
 */
export function unitsForDriver(
  driver: CostDriver,
  trip: CalculateInput['trip'],
  days: number,
  operatingDaysPerMonth: number,
  vars?: VarBag,
  warn?: (message: string) => void,
): Decimal {
  if (driver.startsWith('custom:')) {
    const raw = (vars as Record<string, unknown> | undefined)?.[driver];
    if (raw === undefined || raw === null) {
      warn?.(`La variable "${driver}" no tiene valor en este viaje: la fila de costo vale 0.`);
      return new Decimal(0);
    }
    return toDecimal(raw as number | string);
  }
  switch (driver as BuiltinCostDriver) {
    case 'FIXED':
      return new Decimal(1);
    case 'PER_KM':
      return toDecimal(trip.km);
    case 'PER_DAY':
      return toDecimal(days);
    case 'PER_MONTH_PRORATED': {
      // Un importe mensual se reparte entre los días operativos del mes y se cobran los días que
      // dura el viaje. Con 0 días operativos no se puede prorratear: vale 0 en vez de dividir por
      // cero, y la fila queda visible en el desglose con su 0 para que se note.
      if (operatingDaysPerMonth <= 0) return new Decimal(0);
      return toDecimal(days).dividedBy(operatingDaysPerMonth);
    }
    case 'PER_CLIENT':
      return toDecimal(trip.clientCount);
    case 'PER_HOUR':
      return toDecimal(trip.durationHours);
    default:
      warn?.(`El driver "${driver}" no se reconoce: la fila de costo vale 0.`);
      return new Decimal(0);
  }
}

export const COST_DRIVER_LABELS: Record<BuiltinCostDriver, string> = {
  FIXED: 'Fijo por viaje',
  PER_KM: 'Por kilómetro',
  PER_DAY: 'Por día de viaje',
  PER_MONTH_PRORATED: 'Mensual (prorrateado por día)',
  PER_CLIENT: 'Por parada/cliente',
  PER_HOUR: 'Por hora',
};

/**
 * Costo por kilómetro de un componente que se repite (mantenimiento, llantas…), según cada cuánto:
 *
 * - `km`:    cada N km    → costo ÷ N
 * - `year`:  cada N años  → costo ÷ (N × km por año)
 * - `month`: cada N meses → costo ÷ (N × km por año ÷ 12)
 *
 * Null si faltan datos (frecuencia ≤ 0, o km por año para `year`/`month`).
 */
export function componentCostPerKm(
  row: Pick<CostStructureRow, 'amount' | 'frequency' | 'frequencyQty'>,
  kmPerYear: number | null,
): Decimal | null {
  const qty = row.frequencyQty;
  if (!row.frequency || qty === null || qty === undefined || !(qty > 0)) return null;
  const amount = toDecimal(row.amount);
  switch (row.frequency) {
    case 'km':
      return amount.dividedBy(qty);
    case 'year':
      return kmPerYear && kmPerYear > 0 ? amount.dividedBy(new Decimal(qty).times(kmPerYear)) : null;
    case 'month':
      return kmPerYear && kmPerYear > 0
        ? amount.dividedBy(new Decimal(qty).times(kmPerYear).dividedBy(12))
        : null;
    default:
      return null;
  }
}

function computeFromStructure(
  structure: CostStructure,
  rows: CostStructureRow[],
  input: Pick<CalculateInput, 'country' | 'trip'>,
  overnightNights: number,
  vars: VarBag,
  warn?: (message: string) => void,
): CostBreakdown {
  const { country, trip } = input;
  const days = daysFor(overnightNights);
  const km = toDecimal(trip.km);

  const lines: CostLine[] = rows
    .filter((row) => row.active)
    // Una fila de otro tipo de camión no cuenta en este viaje.
    .filter((row) => !row.truckType || row.truckType === trip.truckTypeId)
    // Una fila condicionada que no se cumple no aporta — misma semántica que una regla.
    // Una fila con una condición ilegible no aporta, y se avisa: callarla cambiaría el costo —y
    // con él el margen— sin que nadie pudiera ver por qué.
    .filter((row) => {
      if (!row.appliesWhen) return true;
      try {
        return evaluatePred(row.appliesWhen, vars);
      } catch (e) {
        if (!(e instanceof RuleShapeError)) throw e;
        warn?.(`La fila de costo "${row.code}" tiene una ${e.message}: no se incluyó en el costo.`);
        return false;
      }
    })
    .sort((a, b) => a.order - b.order)
    .flatMap((row): CostLine[] => {
      const unitAmount = toDecimal(row.amount);
      const signed = row.sign === 'SUBTRACT' ? unitAmount.negated() : unitAmount;

      // Componente que se repite: cuesta (costo por km) × km del viaje.
      if (row.frequency) {
        const perKm = componentCostPerKm(row, structure.params.kmPerYear);
        if (!perKm) {
          warn?.(
            `La fila de costo "${row.code}" no tiene los datos para calcular su costo por km ` +
              '(frecuencia o km por año): no se incluyó.',
          );
          return [];
        }
        const rate = row.sign === 'SUBTRACT' ? perKm.negated() : perKm;
        return [{
          code: row.code,
          label: row.label,
          amount: km.times(rate),
          inputs: {
            frecuencia: `${row.frequencyQty} ${row.frequency}`,
            'costo por km': perKm.toFixed(4),
            km: trip.km,
          },
        }];
      }

      const units = unitsForDriver(row.driver, trip, days, structure.operatingDaysPerMonth, vars, warn);
      return [{
        code: row.code,
        label: row.label,
        amount: units.times(signed),
        inputs: {
          driver: row.driver,
          unidades: units.toFixed(4),
          importe: row.amount,
        },
      }];
    });

  // Combustible: precio del litro ÷ rendimiento del camión, por km. Línea propia para verla aparte.
  const { fuelPrice, fuelEfficiency } = structure.params;
  if (fuelPrice) {
    const efficiency = trip.truckTypeId ? fuelEfficiency[trip.truckTypeId] : undefined;
    if (efficiency && toDecimal(efficiency).greaterThan(0)) {
      lines.push({
        code: 'COMBUSTIBLE',
        label: 'Combustible',
        amount: km.times(toDecimal(fuelPrice)).dividedBy(toDecimal(efficiency)),
        inputs: { km: trip.km, 'precio por litro': fuelPrice, 'km por litro': efficiency },
      });
    } else {
      warn?.(`No hay rendimiento (km por litro) para el camión "${trip.truckTypeId}": no se calculó el combustible.`);
    }
  }

  return {
    total: roundToMoney(addAll(lines.map((l) => l.amount)), country),
    breakdown: toTraceLines(lines, country, 'COST_ROW'),
    modelId: structure.id,
    currency: country.localCurrency,
  };
}

const hasRows = (structure: CostStructure | null | undefined, rows: CostStructureRow[] | undefined) =>
  !!structure?.active && !!rows?.length;

/** Sin gastos que acumular: el viaje es de un tercero (se le paga por tarifario/reglas) o no hay nada. */
const NO_COST = (country: Country): CostBreakdown => ({
  total: roundToMoney(new Decimal(0), country),
  breakdown: [],
  modelId: 'NONE',
  currency: country.localCurrency,
});

/**
 * Gastos operativos de un viaje de FLOTA PROPIA: la acumulación de la estructura de costos. Es lo
 * que se liquida. La estructura de la compañía manda; si no tiene, vale la del país; sin ninguna no
 * hay con qué calcular y se avisa (no se inventa un cero).
 *
 * Un viaje de un tercero no tiene gastos propios: se le paga lo que dicen las reglas y el
 * tarifario, así que devuelve vacío.
 */
export function computeCost(
  input: Pick<
    CalculateInput,
    'country' | 'trip' | 'costStructure' | 'costStructureRows'
    | 'defaultCostStructure' | 'defaultCostStructureRows'
  >,
  overnightNights: number,
  vars?: VarBag,
  /** Canal de avisos. Sin él, una fila de costo ilegible cambiaría el total en silencio. */
  warn?: (message: string) => void,
): CostBreakdown {
  const { country, trip } = input;
  const bag = vars ?? ({} as VarBag);

  if (trip.fleetType !== 'OWN') return NO_COST(country);

  if (hasRows(input.costStructure, input.costStructureRows)) {
    return computeFromStructure(input.costStructure!, input.costStructureRows!, input, overnightNights, bag, warn);
  }
  if (hasRows(input.defaultCostStructure, input.defaultCostStructureRows)) {
    return computeFromStructure(
      input.defaultCostStructure!, input.defaultCostStructureRows!, input, overnightNights, bag, warn,
    );
  }
  throw new Error(
    'No hay estructura de costos para la flota propia de este país. ' +
      'Cárguela en Reglas de Tarifa → Costos antes de liquidar.',
  );
}
