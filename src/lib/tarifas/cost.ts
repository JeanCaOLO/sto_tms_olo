// Motor de costos. Deliberadamente NO es "una regla más" del lenguaje de reglas: el costo no se
// liquida al transportista, se calcula con su propio modelo (OWN u OUTSOURCED) y solo se usa para
// derivar el margen. Mezclarlo con el AST de Rule obligaría a forzar conceptos de costo (flota
// propia, tarifas de transportista) dentro de un vocabulario pensado para tarifas.
// Puerto literal de vista-tarifas-fase1/src/kernel/cost.ts.

import Decimal from 'decimal.js';
import type { CalculateInput, CostBreakdown, Country, Stage, TraceLine } from './types';
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
    return {
      seq: index + 1,
      stage,
      ruleId: null,
      ruleCode: line.code,
      label: line.label,
      inputs: line.inputs,
      computed: roundToMoney(line.amount, country),
      currency: country.refCurrency,
      computedRef: roundToMoney(line.amount, country),
      final: roundToMoney(line.amount, country),
      runningSubtotal: roundToMoney(running, country),
    };
  });
}

export function computeCost(
  input: Pick<CalculateInput, 'country' | 'trip' | 'ownCostParams' | 'outsourcedCostRates'>,
  overnightNights: number,
): CostBreakdown {
  const { country, trip, ownCostParams, outsourcedCostRates } = input;

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
    };
  }

  // OUTSOURCED: tarifa plana del transportista para ese tipo de camión.
  const rate = outsourcedCostRates.find(
    (r) => r.carrierId === trip.carrierId && r.truckTypeId === trip.truckTypeId,
  );
  if (!rate) {
    throw new Error(
      `No hay tarifa de outsourcing configurada para carrier="${trip.carrierId ?? '(ninguno)'}" ` +
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
  };
}
