// Cálculo de costos desde estructura de filas. Motor de acumulación de gastos.

import Decimal from 'decimal.js';
import type {
  CalculateInput, CostBreakdown, CostStructure, CostStructureRow, Country, Stage, TraceLine, TraceSource, VarBag,
} from '../types';
import { evaluatePred, RuleShapeError } from '../evaluator';
import { addAll, roundToMoney, toDecimal } from '../money';
import { unitsForDriver, componentCostPerKm } from './driver';
import { fuelEfficiencyFor, pickStructure, rowAppliesToTruck } from './shared';

interface CostLine {
  code: string;
  label: string;
  amount: Decimal;
  inputs: Record<string, string | number>;
}

/** Número de días: siempre 1 + noches de pernocta. */
function daysFor(overnightNights: number): number {
  return overnightNights + 1;
}

/** Convierte líneas de costo a TraceLine para desglose (compatible con UI). */
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

/**
 * Filtra y transforma filas de estructura en líneas de costo acumuladas.
 * Maneja drivers, frecuencias, condiciones y combustible.
 */
function computeCostLines(
  structure: CostStructure,
  rows: CostStructureRow[],
  trip: CalculateInput['trip'],
  days: number,
  km: Decimal,
  vars: VarBag,
  warn?: (message: string) => void,
): CostLine[] {
  const lines: CostLine[] = rows
    .filter((row) => row.active)
    // Filtrar por tipo de camión.
    .filter((row) => rowAppliesToTruck(row, trip.truckTypeId))
    // Filtrar por condición.
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

      // Componente repetible (mantenimiento, neumáticos…): costo/km × km.
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

      // Driver de unidades.
      const units = unitsForDriver(
        row.driver,
        trip,
        days,
        structure.operatingDaysPerMonth,
        vars,
        warn,
      );
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

  // Combustible: línea propia para verlo aparte.
  const { fuelPrice, fuelEfficiency } = structure.params;
  if (fuelPrice) {
    const efficiency = fuelEfficiencyFor(fuelEfficiency, trip.truckTypeId);
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

  return lines;
}

/**
 * Calcula desglose de costos desde estructura activa (de compañía o país).
 * Devuelve CostBreakdown con líneas ordenadas y total redondeado.
 */
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

  // Los ceros silenciosos esconden datos que faltan: se avisan en vez de dar un costo "correcto" de 0.
  if (!km.greaterThan(0)) {
    warn?.('El viaje tiene 0 km: los gastos por kilómetro y el combustible valen 0.');
  }
  if (structure.operatingDaysPerMonth <= 0 && rows.some((r) => r.active && r.driver === 'PER_MONTH_PRORATED')) {
    warn?.('La estructura no tiene días operativos por mes: los importes mensuales prorrateados valen 0.');
  }

  const lines = computeCostLines(structure, rows, trip, days, km, vars, warn);

  // El total es la suma de las líneas YA redondeadas: son las que el pipeline siembra como base,
  // así que el costo y la base de la liquidación coinciden al centavo (margen incluido).
  const breakdown = toTraceLines(lines, country, 'COST_ROW');
  return {
    total: roundToMoney(addAll(breakdown.map((l) => toDecimal(l.final))), country),
    breakdown,
    modelId: structure.id,
    currency: country.localCurrency,
  };
}

/** Costo cero: tercero o sin estructura. */
const NO_COST = (country: Country): CostBreakdown => ({
  total: roundToMoney(new Decimal(0), country),
  breakdown: [],
  modelId: 'NONE',
  currency: country.localCurrency,
});

/**
 * Gastos operativos de un viaje de FLOTA PROPIA: acumulación de estructura de costos.
 * Terceros no tienen gastos propios (se pagan por reglas).
 * Devuelve error si flota propia sin estructura.
 */
export function computeCost(
  input: Pick<
    CalculateInput,
    'country' | 'trip' | 'costStructure' | 'costStructureRows'
    | 'defaultCostStructure' | 'defaultCostStructureRows'
  >,
  overnightNights: number,
  vars?: VarBag,
  warn?: (message: string) => void,
): CostBreakdown {
  const { country, trip } = input;
  const bag = vars ?? ({} as VarBag);

  if (trip.fleetType !== 'OWN') return NO_COST(country);

  const picked = pickStructure(input);
  if (picked) {
    return computeFromStructure(picked.structure, picked.rows, input, overnightNights, bag, warn);
  }

  throw new Error(
    'No hay estructura de costos para la flota propia de este país. ' +
    'Cárguela en Costos Flota → Flota Propia → Estructura del país antes de liquidar.',
  );
}
