// Estructura de costos por filas.
//
// El caso central reproduce los totales de `Estructura_Costos_Transporte.xlsx`: si el motor no
// devuelve el mismo COSTO FIJO DIARIO que la planilla, la migración desde Excel no sirve.

import { describe, expect, it } from 'vitest';
import { computeCost, unitsForDriver } from '../cost';
import { deriveContext } from '../resolver';
import { makeCountryVE, makeGeoVE, makeOwnCostParams, makeTrip } from './fixtures';
import type { CostStructure, CostStructureRow, VarBag } from '../types';

const estructura = (overrides: Partial<CostStructure> = {}): CostStructure => ({
  id: 'CSTR_1',
  partyId: 'P1',
  countryId: 'VE',
  name: 'Estructura de ejemplo',
  operatingDaysPerMonth: 30,
  effectiveFrom: null,
  active: true,
  notes: null,
  ...overrides,
});

let seq = 0;
const fila = (overrides: Partial<CostStructureRow> = {}): CostStructureRow => {
  seq += 1;
  return {
    id: `R${seq}`,
    structureId: 'CSTR_1',
    code: `C${seq}`,
    label: `Concepto ${seq}`,
    driver: 'FIXED',
    amount: '0',
    sign: 'ADD',
    appliesWhen: null,
    unit: null,
    order: seq,
    active: true,
    ...overrides,
  };
};

// Las variables se derivan del viaje con el mismo `deriveContext` que usa el motor: una fila
// condicionada por tipo de camión tiene que resolver igual acá que en una liquidación real.
function costOf(rows: CostStructureRow[], tripOverrides = {}, str = estructura()) {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  const trip = makeTrip(tripOverrides);
  const { vars } = deriveContext({ trip, country, zones, zoneGroups, locations });

  return computeCost(
    {
      country,
      trip,
      ownCostParams: makeOwnCostParams(),
      outsourcedCostRates: [],
      costStructure: str,
      costStructureRows: rows,
    },
    0,
    vars,
  );
}

// ── Drivers ───────────────────────────────────────────────────────────────────────────────────

describe('unitsForDriver', () => {
  const trip = makeTrip({ km: 180, clientCount: 40, packageCount: 55, durationHours: 6 });

  it('cada driver toma la magnitud que le corresponde', () => {
    expect(unitsForDriver('FIXED', trip, 1, 30).toString()).toBe('1');
    expect(unitsForDriver('PER_KM', trip, 1, 30).toString()).toBe('180');
    expect(unitsForDriver('PER_DAY', trip, 2, 30).toString()).toBe('2');
    expect(unitsForDriver('PER_CLIENT', trip, 1, 30).toString()).toBe('40');
    expect(unitsForDriver('PER_PACKAGE', trip, 1, 30).toString()).toBe('55');
    expect(unitsForDriver('PER_HOUR', trip, 1, 30).toString()).toBe('6');
  });

  it('el prorrateo mensual reparte entre los días operativos y cobra los días del viaje', () => {
    // Un viaje de 1 día contra 30 días operativos = 1/30 del importe mensual.
    expect(unitsForDriver('PER_MONTH_PRORATED', trip, 1, 30).toFixed(6)).toBe('0.033333');
    expect(unitsForDriver('PER_MONTH_PRORATED', trip, 3, 30).toFixed(6)).toBe('0.100000');
  });

  it('con cero días operativos vale cero, en vez de dividir por cero', () => {
    expect(unitsForDriver('PER_MONTH_PRORATED', trip, 1, 0).toString()).toBe('0');
  });
});

// ── El caso real ──────────────────────────────────────────────────────────────────────────────

describe('reproduce los totales de la planilla de ejemplo', () => {
  // Importada de las hojas "Costos Conductor", "Costos Ayudante", "Depreciacion" y "Mantenimiento".
  const filas: CostStructureRow[] = [
    // Conductor — mensuales
    fila({ code: 'SALARIO_CHOFER', label: 'Salario Chofer', driver: 'PER_MONTH_PRORATED', amount: '820600' }),
    fila({ code: 'AGUINALDO_CHOFER', label: 'Aguinaldo Chofer', driver: 'PER_MONTH_PRORATED', amount: '83333.33' }),
    fila({ code: 'SEGURO', label: 'Seguro (terceros)', driver: 'PER_MONTH_PRORATED', amount: '19000' }),
    fila({ code: 'MARCHAMO', label: 'Marchamo', driver: 'PER_MONTH_PRORATED', amount: '18949.16' }),
    fila({ code: 'DEKRA', label: 'DEKRA', driver: 'PER_MONTH_PRORATED', amount: '888' }),
    fila({ code: 'ZAPATOS', label: 'Zapatos y chaleco', driver: 'PER_MONTH_PRORATED', amount: '4000' }),
    // Ayudante — mensuales
    fila({ code: 'SALARIO_AYUD', label: 'Salario Ayudante', driver: 'PER_MONTH_PRORATED', amount: '462666.84' }),
    fila({ code: 'AGUINALDO_AYUD', label: 'Aguinaldo Ayudante', driver: 'PER_MONTH_PRORATED', amount: '38555.57' }),
    // Depreciación del camión activo (3-4.5 Ton)
    fila({
      code: 'DEPRECIACION_T3', label: 'Depreciación 3-4.5 Ton', driver: 'PER_MONTH_PRORATED',
      amount: '277777.777777778',
      appliesWhen: { p: 'EQ', left: 'truckTypeId', right: 'T3' },
    }),
    // Mantenimiento — por km
    fila({ code: 'MANTENIMIENTO', label: 'Mantenimiento por km', driver: 'PER_KM', amount: '48.8118' }),
  ];

  it('un viaje de un día reproduce el COSTO FIJO DIARIO de la planilla', () => {
    // La planilla dice: total fijos mensuales 1.725.770,68 ÷ 30 días = 57.525,69 diario.
    const result = costOf(filas, { km: 0, truckTypeId: 'T3' });

    expect(Number(result.total)).toBeCloseTo(57525.69, 2);
    expect(result.currency).toBe('USD');
  });

  it('sumando el mantenimiento da el costo de un viaje de 100 km', () => {
    // 57.525,69 fijo + 100 km × 48,8118 = 62.406,87
    const result = costOf(filas, { km: 100, truckTypeId: 'T3' });
    expect(Number(result.total)).toBeCloseTo(62406.87, 2);
  });

  it('con otro camión, la depreciación de ese camión no se cobra', () => {
    const conT3 = Number(costOf(filas, { km: 0, truckTypeId: 'T3' }).total);
    const conT1 = Number(costOf(filas, { km: 0, truckTypeId: 'T1' }).total);

    // 277.777,78 ÷ 30 = 9.259,26 de diferencia.
    expect(conT3 - conT1).toBeCloseTo(9259.26, 2);
  });

  it('el desglose lista cada concepto, con sus unidades a la vista', () => {
    const result = costOf(filas, { km: 100, truckTypeId: 'T3' });

    expect(result.breakdown).toHaveLength(10);
    const mantenimiento = result.breakdown.find((l) => l.ruleCode === 'MANTENIMIENTO');
    expect(mantenimiento?.inputs).toMatchObject({ driver: 'PER_KM', unidades: '100.0000', importe: '48.8118' });
  });
});

// ── Comportamiento general ────────────────────────────────────────────────────────────────────

describe('filas', () => {
  it('una fila SUBTRACT resta', () => {
    const result = costOf([
      fila({ code: 'A', driver: 'FIXED', amount: '100' }),
      fila({ code: 'B', driver: 'FIXED', amount: '30', sign: 'SUBTRACT' }),
    ]);
    expect(Number(result.total)).toBeCloseTo(70, 2);
  });

  it('una fila inactiva no aporta ni aparece', () => {
    const result = costOf([
      fila({ code: 'A', driver: 'FIXED', amount: '100' }),
      fila({ code: 'B', driver: 'FIXED', amount: '50', active: false }),
    ]);
    expect(Number(result.total)).toBeCloseTo(100, 2);
    expect(result.breakdown.map((l) => l.ruleCode)).toEqual(['A']);
  });

  it('respeta el orden declarado, no el de llegada', () => {
    const result = costOf([
      fila({ code: 'SEGUNDA', driver: 'FIXED', amount: '1', order: 2 }),
      fila({ code: 'PRIMERA', driver: 'FIXED', amount: '1', order: 1 }),
    ]);
    expect(result.breakdown.map((l) => l.ruleCode)).toEqual(['PRIMERA', 'SEGUNDA']);
  });
});

describe('compatibilidad', () => {
  it('sin estructura cargada, sigue usando los parámetros de costo anteriores', () => {
    const result = computeCost(
      {
        country: makeCountryVE(),
        trip: makeTrip({ km: 100 }),
        ownCostParams: makeOwnCostParams(),
        outsourcedCostRates: [],
        costStructure: null,
        costStructureRows: [],
      },
      0,
      {} as VarBag,
    );

    // 100 km × (1.10 + 0.18) + 1 día × 35 = 163
    expect(Number(result.total)).toBeCloseTo(163, 2);
    expect(result.modelId).toBe('OWN');
  });

  it('una estructura desactivada tampoco se usa', () => {
    const result = costOf(
      [fila({ code: 'A', driver: 'FIXED', amount: '999' })],
      { km: 100 },
      estructura({ active: false }),
    );
    expect(result.modelId).toBe('OWN');
  });
});
