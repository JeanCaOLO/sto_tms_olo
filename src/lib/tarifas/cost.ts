// Motor de costos. Deliberadamente NO es "una regla más" del lenguaje de reglas: el costo no se
// liquida al transportista, se calcula con su propio modelo (OWN u OUTSOURCED) y solo se usa para
// derivar el margen. Mezclarlo con el AST de Rule obligaría a forzar conceptos de costo (flota
// propia, tarifas de transportista) dentro de un vocabulario pensado para tarifas.
//
// MONEDA: hay una sola por país, así que el costo y el total liquidado están siempre en la misma y
// el margen compara moneda contra la misma moneda por construcción.

import Decimal from 'decimal.js';
import type {
  CalculateInput, CostBreakdown, CostDriver, CostStructure, CostStructureRow, Country,
  Stage, TraceLine, VarBag,
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
function toTraceLines(lines: CostLine[], country: Country): TraceLine[] {
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
 */
export function unitsForDriver(
  driver: CostDriver,
  trip: CalculateInput['trip'],
  days: number,
  operatingDaysPerMonth: number,
): Decimal {
  switch (driver) {
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
    case 'PER_PACKAGE':
      return toDecimal(trip.packageCount);
    case 'PER_HOUR':
      return toDecimal(trip.durationHours);
  }
}

export const COST_DRIVER_LABELS: Record<CostDriver, string> = {
  FIXED: 'Fijo por viaje',
  PER_KM: 'Por kilómetro',
  PER_DAY: 'Por día de viaje',
  PER_MONTH_PRORATED: 'Mensual (prorrateado por día)',
  PER_CLIENT: 'Por parada/cliente',
  PER_PACKAGE: 'Por bulto',
  PER_HOUR: 'Por hora',
};

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

  const lines: CostLine[] = rows
    .filter((row) => row.active)
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
    .map((row) => {
      const units = unitsForDriver(row.driver, trip, days, structure.operatingDaysPerMonth);
      const unitAmount = toDecimal(row.amount);
      const signed = row.sign === 'SUBTRACT' ? unitAmount.negated() : unitAmount;

      return {
        code: row.code,
        label: row.label,
        amount: units.times(signed),
        inputs: {
          driver: row.driver,
          unidades: units.toFixed(4),
          importe: row.amount,
        },
      };
    });

  return {
    total: roundToMoney(addAll(lines.map((l) => l.amount)), country),
    breakdown: toTraceLines(lines, country),
    modelId: structure.id,
    currency: country.localCurrency,
  };
}

export function computeCost(
  input: Pick<
    CalculateInput,
    'country' | 'trip' | 'ownCostParams' | 'outsourcedCostRates' | 'costStructure' | 'costStructureRows'
  >,
  overnightNights: number,
  vars?: VarBag,
  /** Canal de avisos. Sin él, una fila de costo ilegible cambiaría el margen en silencio. */
  warn?: (message: string) => void,
): CostBreakdown {
  const { country, trip, ownCostParams, outsourcedCostRates } = input;

  // La estructura por filas manda sobre todo lo demás: es el modelo completo. `ownCostParams` y las
  // tarifas planas quedan como respaldo para las compañías que todavía no cargaron la suya.
  if (input.costStructure?.active && input.costStructureRows?.length) {
    return computeFromStructure(
      input.costStructure,
      input.costStructureRows,
      input,
      overnightNights,
      vars ?? ({} as VarBag),
      warn,
    );
  }

  if (trip.fleetType === 'OWN') {
    const km = toDecimal(trip.km);
    const days = daysFor(overnightNights);
  
    const lines: CostLine[] = [
      {
        code: 'COST_KM',
        label: 'Costo operativo por km',
        amount: km.times(toDecimal(ownCostParams.costPerKm)),
        inputs: { km: trip.km, rate: ownCostParams.costPerKm },
      },
      {
        code: 'COST_DEPRECIATION',
        label: 'Depreciación por km',
        amount: km.times(toDecimal(ownCostParams.depreciationPerKm)),
        inputs: { km: trip.km, rate: ownCostParams.depreciationPerKm },
      },
      {
        code: 'COST_DRIVER',
        label: 'Chofer (por día)',
        amount: toDecimal(days).times(toDecimal(ownCostParams.driverDaily)),
        inputs: { days, rate: ownCostParams.driverDaily },
      },
    ];

    return {
      total: roundToMoney(addAll(lines.map((l) => l.amount)), country),
      breakdown: toTraceLines(lines, country),
      modelId: 'OWN',
      currency: country.localCurrency,
    };
  }

  // OUTSOURCED: tarifa plana de la compañía para ese tipo de camión.
  //
  // La búsqueda va por `partyId` (la compañía del tarifador), no por `carrierId` (el transportista
  // del TMS): las tarifas de outsourcing se configuran contra compañías del tarifador. Se acepta
  // `carrierId` como respaldo para los viajes armados antes de que `partyId` existiera.
  const partyKey = trip.partyId ?? trip.carrierId;
  const rate = outsourcedCostRates.find(
    (r) => r.carrierId === partyKey && r.truckTypeId === trip.truckTypeId,
  );
  if (!rate) {
    throw new Error(
      `No hay tarifa de outsourcing configurada para la compañía "${partyKey ?? '(ninguna)'}" ` +
        `y truckType="${trip.truckTypeId}". Configúrela en Tarifas → Reglas de Tarifa → Costos antes de liquidar.`,
    );
  }
  const lines: CostLine[] = [
    {
      code: 'COST_FLAT',
      label: 'Tarifa plana del transportista',
      amount: toDecimal(rate.flatRate),
      inputs: { flatRate: rate.flatRate, truckTypeId: trip.truckTypeId },
    },
  ];

  return {
    total: roundToMoney(lines[0]!.amount, country),
    breakdown: toTraceLines(lines, country),
    modelId: rate.id,
    currency: country.localCurrency,
  };
}
