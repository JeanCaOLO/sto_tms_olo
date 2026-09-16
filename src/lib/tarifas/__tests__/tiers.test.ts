// Escalones: los tres modos.
//
// El caso guía es un contrato de transporte real:
//
//   "Hasta 100 km: 2,00/km · de 101 a 300: 1,50/km · más de 300: 1,20/km"
//
// Para un viaje de 250 km hay tres lecturas posibles de esa tabla, y las tres existen en contratos
// de verdad. Antes el motor solo sabía hacer una —y ni siquiera la que el contrato suele querer—.
// La diferencia entre las otras dos es de 50 en un solo viaje.

import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { progressiveAmount, sortTiers } from '../evaluator';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, Expr, Tier, TierMode, TripContext } from '../types';

const CONTRATO: Tier[] = [
  { upTo: 100, amount: '2.00' },
  { upTo: 300, amount: '1.50' },
  { upTo: null, amount: '1.20' },
];

function totalDe(mode: TierMode | undefined, tiers: Tier[], trip: Partial<TripContext>): string {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  const expression: Expr = { op: 'TIERED', unit: 'km', tiers, ...(mode ? { mode } : {}) };

  const input: CalculateInput = {
    country,
    trip: makeTrip(trip),
    rules: [makeRule({ code: 'ESCALONES', stage: 'BASE', expression })],
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
  };
  return calculate(input).totalLiquidado;
}

// ── Los tres modos sobre el mismo contrato ────────────────────────────────────────────────────

describe('un viaje de 250 km, la misma tabla, tres lecturas', () => {
  it('FLAT: el tramo fija un importe fijo', () => {
    // 250 cae en el tramo "hasta 300": el importe es 1,50. Es lo único que sabía hacer el motor.
    expect(totalDe('FLAT', CONTRATO, { km: 250 })).toBe('1.50');
  });

  it('RATE: el tramo fija la tarifa de TODAS las unidades', () => {
    // 250 × 1,50
    expect(totalDe('RATE', CONTRATO, { km: 250 })).toBe('375.00');
  });

  it('PROGRESSIVE: cada tramo cobra solo lo suyo', () => {
    // 100 × 2,00 + 150 × 1,50 = 200 + 225
    expect(totalDe('PROGRESSIVE', CONTRATO, { km: 250 })).toBe('425.00');
  });

  it('la diferencia entre las dos lecturas razonables es de 50 en un viaje', () => {
    const porTarifa = Number(totalDe('RATE', CONTRATO, { km: 250 }));
    const marginal = Number(totalDe('PROGRESSIVE', CONTRATO, { km: 250 }));
    expect(marginal - porTarifa).toBe(50);
  });
});

describe('compatibilidad', () => {
  it('una regla sin modo se sigue interpretando como FLAT', () => {
    // Las reglas escritas antes de que el campo existiera no cambian de comportamiento.
    expect(totalDe(undefined, CONTRATO, { km: 250 })).toBe('1.50');
  });
});

// ── Bordes ────────────────────────────────────────────────────────────────────────────────────

describe('bordes de los tramos', () => {
  it('el límite superior es INCLUSIVO', () => {
    // 100 km todavía es el primer tramo.
    expect(totalDe('RATE', CONTRATO, { km: 100 })).toBe('200.00');
    // 101 ya es el segundo.
    expect(totalDe('RATE', CONTRATO, { km: 101 })).toBe('151.50');
  });

  it('el tramo abierto cubre de ahí en adelante', () => {
    expect(totalDe('RATE', CONTRATO, { km: 500 })).toBe('600.00');   // 500 × 1,20
    expect(totalDe('PROGRESSIVE', CONTRATO, { km: 500 })).toBe('740.00'); // 200 + 300 + 240
  });

  it('cantidad cero da cero en los tres modos', () => {
    expect(totalDe('RATE', CONTRATO, { km: 0 })).toBe('0.00');
    expect(totalDe('PROGRESSIVE', CONTRATO, { km: 0 })).toBe('0.00');
    // FLAT devuelve el importe del primer tramo: 0 km cae en "hasta 100".
    expect(totalDe('FLAT', CONTRATO, { km: 0 })).toBe('2.00');
  });

  it('un solo tramo abierto equivale a una tarifa plana por unidad', () => {
    const plano: Tier[] = [{ upTo: null, amount: '1.20' }];
    expect(totalDe('RATE', plano, { km: 250 })).toBe('300.00');
    expect(totalDe('PROGRESSIVE', plano, { km: 250 })).toBe('300.00');
  });
});

describe('tablas mal armadas', () => {
  it('sin tramo abierto, una cantidad que se pasa avisa y no rompe el cálculo', () => {
    const incompleta: Tier[] = [{ upTo: 100, amount: '2.00' }];
    // Antes esto lanzaba una excepción y tumbaba la liquidación entera.
    expect(totalDe('RATE', incompleta, { km: 250 })).toBe('0.00');
  });

  it('los tramos desordenados se ordenan solos', () => {
    // Escritos al revés, el resultado tiene que ser el mismo: sin esto, "el primero que cubre"
    // elegiría el tramo equivocado y el importe saldría mal sin ninguna señal.
    const desordenada: Tier[] = [
      { upTo: null, amount: '1.20' },
      { upTo: 300, amount: '1.50' },
      { upTo: 100, amount: '2.00' },
    ];
    expect(totalDe('RATE', desordenada, { km: 250 })).toBe('375.00');
    expect(totalDe('PROGRESSIVE', desordenada, { km: 250 })).toBe('425.00');
  });
});

// ── Unidades puras ────────────────────────────────────────────────────────────────────────────

describe('sortTiers', () => {
  it('ordena de menor a mayor y deja el abierto al final', () => {
    const ordenados = sortTiers([
      { upTo: null, amount: 'c' },
      { upTo: 300, amount: 'b' },
      { upTo: 100, amount: 'a' },
    ]);
    expect(ordenados.map((t) => t.amount)).toEqual(['a', 'b', 'c']);
  });
});

describe('progressiveAmount', () => {
  it('acumula tramo por tramo', () => {
    expect(progressiveAmount(new Decimal(250), CONTRATO).toFixed(2)).toBe('425.00');
  });

  it('conserva la precisión decimal en las fracciones', () => {
    const tiers: Tier[] = [{ upTo: 3, amount: '0.333333333' }, { upTo: null, amount: '0.1' }];
    // 3 × 0,333333333 = 0,999999999, más 0,5 × 0,1
    expect(progressiveAmount(new Decimal(3.5), tiers).toFixed(9)).toBe('1.049999999');
  });
});
