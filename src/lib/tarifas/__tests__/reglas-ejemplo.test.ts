// Las seis reglas que pidió el usuario, escritas tal cual con el vocabulario del motor. Este
// archivo existe para responder una sola pregunta, y que quede respondida por ejecución y no por
// promesa: ¿se pueden expresar esos casos SIN escribir código ni JSON a mano?

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import {
  makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip,
} from './fixtures';
import type { CalculateInput, PartyVariable, Rule, TripContext } from '../types';

// Peajes y recolectas no son datos del viaje de guía de despacho: son variables personalizadas
// PER_TRIP de la compañía (ROADMAP §8). Se declaran acá para el perfil del viaje de prueba.
const PERFIL = 'PERFIL_TEST';
const variable = (key: `custom:${string}`, label: string): PartyVariable => ({
  id: `PV_${key}`, partyId: PERFIL, key, label, kind: 'NUMBER', origin: 'PER_TRIP',
  defaultValue: '0', unit: null, active: true,
});
const VARIABLES = [variable('custom:peajes', 'Peajes'), variable('custom:recolectas', 'Recolectas')];

/** Viaje con N peajes (o recolectas) cargados al liquidar. */
const peajes = (n: number): Partial<TripContext> => ({ customVars: { 'custom:peajes': n } });
const recolectas = (n: number): Partial<TripContext> => ({ customVars: { 'custom:recolectas': n } });

function run(rules: Rule[], trip: Partial<TripContext> = {}) {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  const input: CalculateInput = {
    country,
    trip: makeTrip({ partyId: PERFIL, ...trip }),
    rules,
    zones,
    zoneGroups,
    locations, // 1:1, para que los números del test sean los de la regla
    ...makeOwnCostStructure(),
    marginPolicy: makeMarginPolicy(),
    partyVariables: VARIABLES,
  };
  return calculate(input);
}

const total = (rules: Rule[], trip: Partial<TripContext> = {}) => run(rules, trip).totalLiquidado;

describe('las seis reglas del requerimiento', () => {
  it('1. si el camión es NPR, el monto base es 400', () => {
    const regla = makeRule({
      code: 'NPR_BASE',
      stage: 'BASE',
      stacking: 'EXCLUSIVE',
      conditions: { p: 'EQ', left: 'truckTypeId', right: 'NPR' },
      expression: { op: 'FIXED', amount: '400.00' },
    });

    expect(total([regla], { truckTypeId: 'NPR' })).toBe('400.00');
    expect(total([regla], { truckTypeId: 'OTRO' })).toBe('0.00');
  });

  it('2. si el camión es grande, sube 20%', () => {
    const base = makeRule({
      code: 'BASE',
      stage: 'BASE',
      priority: 10,
      expression: { op: 'FIXED', amount: '400.00' },
    });
    // "Grande" se define por un umbral de capacidad, no por un nombre: así la regla no depende de
    // cómo se llame el modelo de camión.
    const grande = makeRule({
      code: 'RECARGO_GRANDE',
      stage: 'MODIFIER',
      priority: 20,
      conditions: { p: 'GTE', left: 'truckWeightTons', right: 10 },
      expression: { op: 'PERCENT', pct: '0.20', base: { of: 'STAGE_SUBTOTAL', stage: 'BASE' } },
    });

    expect(total([base, grande], { truckWeightTons: 12 })).toBe('480.00'); // 400 + 20%
    expect(total([base, grande], { truckWeightTons: 3 })).toBe('400.00');
  });

  it('3. metros cúbicos del camión × 10', () => {
    const regla = makeRule({
      code: 'POR_VOLUMEN',
      stage: 'VARIABLE',
      expression: { op: 'PER_UNIT', unit: 'truckVolumeM3', rate: '10.00' },
    });

    expect(total([regla], { truckVolumeM3: 12 })).toBe('120.00');
  });

  it('4. cada peaje transitado suma 20 (variable personalizada por viaje)', () => {
    const regla = makeRule({
      code: 'BONO_PEAJE',
      stage: 'SURCHARGE',
      expression: { op: 'PER_UNIT', unit: 'custom:peajes', rate: '20.00' },
    });

    expect(total([regla], peajes(3))).toBe('60.00');
    expect(total([regla], peajes(0))).toBe('0.00');
  });

  it('5. si hay más de 20 peajes, suma 10', () => {
    const regla = makeRule({
      code: 'EXTRA_20_PEAJES',
      stage: 'SURCHARGE',
      conditions: { p: 'GT', left: 'custom:peajes', right: 20 },
      expression: { op: 'FIXED', amount: '10.00' },
    });

    expect(total([regla], peajes(21))).toBe('10.00');
    expect(total([regla], peajes(20))).toBe('0.00'); // "más de 20" no incluye a 20
  });

  it('6. cada 10 peajes, suma 15', () => {
    const regla = makeRule({
      code: 'BLOQUE_PEAJES',
      stage: 'SURCHARGE',
      expression: { op: 'PER_BLOCK', unit: 'custom:peajes', blockSize: 10, amount: '15.00' },
    });

    expect(total([regla], peajes(9))).toBe('0.00');   // ni un bloque completo
    expect(total([regla], peajes(10))).toBe('15.00');
    expect(total([regla], peajes(25))).toBe('30.00'); // 2 bloques, no 2,5
  });

  it('las tres reglas de peajes conviven y el desglose explica cada una', () => {
    const porPeaje = makeRule({
      code: 'BONO_PEAJE', stage: 'SURCHARGE', priority: 10,
      expression: { op: 'PER_UNIT', unit: 'custom:peajes', rate: '20.00' },
    });
    const masDe20 = makeRule({
      code: 'EXTRA_20_PEAJES', stage: 'SURCHARGE', priority: 20,
      conditions: { p: 'GT', left: 'custom:peajes', right: 20 },
      expression: { op: 'FIXED', amount: '10.00' },
    });
    const cada10 = makeRule({
      code: 'BLOQUE_PEAJES', stage: 'SURCHARGE', priority: 30,
      expression: { op: 'PER_BLOCK', unit: 'custom:peajes', blockSize: 10, amount: '15.00' },
    });

    const result = run([porPeaje, masDe20, cada10], peajes(25));

    // 25 × 20 = 500, más 10 por pasar de 20, más 2 bloques × 15 = 30.
    expect(result.totalLiquidado).toBe('540.00');
    expect(result.trace).toHaveLength(3);
    expect(result.trace.map((l) => l.final)).toEqual(['500.00', '10.00', '30.00']);
  });

  it('una variable por viaje que no se cargó vale su valor por defecto (0): no cobra peajes que no hubo', () => {
    const regla = makeRule({
      code: 'BONO_PEAJE', stage: 'SURCHARGE',
      expression: { op: 'PER_UNIT', unit: 'custom:peajes', rate: '20.00' },
    });
    expect(total([regla])).toBe('0.00');
  });
});

describe('PER_BLOCK — bordes', () => {
  it('no cuenta bloques parciales', () => {
    const regla = makeRule({
      code: 'B', stage: 'SURCHARGE',
      expression: { op: 'PER_BLOCK', unit: 'custom:recolectas', blockSize: 3, amount: '5.00' },
    });
    expect(total([regla], recolectas(2))).toBe('0.00');
    expect(total([regla], recolectas(8))).toBe('10.00'); // 2 bloques de 3
  });

  it('falla fuerte si el tamaño de bloque es cero', () => {
    const regla = makeRule({
      code: 'B', stage: 'SURCHARGE',
      expression: { op: 'PER_BLOCK', unit: 'custom:peajes', blockSize: 0, amount: '5.00' },
    });
    expect(() => total([regla], peajes(10))).toThrow('blockSize');
  });
});
