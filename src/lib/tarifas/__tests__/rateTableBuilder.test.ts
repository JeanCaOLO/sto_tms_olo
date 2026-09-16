// El operador "Tarifa de tabla" del constructor visual.
//
// Sin él, un tarifario era inalcanzable: el motor sabía buscar en la tabla desde hacía varios pasos,
// pero para usarla había que escribir `{"op":"LOOKUP_TABLE"}` a mano en el modo avanzado. El
// requisito pedía que todo se armara sin tocar código, así que una función que solo existe en el
// JSON es una función que no existe.
//
// Lo que se cuida acá es el RESPALDO. Es el campo que la gente deja vacío sin pensarlo, y sin él un
// viaje que no casa ninguna fila se liquida en cero — un cero que no se distingue de una tarifa
// real de cero.

import { describe, expect, it } from 'vitest';
import { compileBuilder, describeBuilder, isBuilderValid, validateBuilder } from '../rule-builder';
import { varLabel } from '../format';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, RateTable, RateTableRow, RuleBuilderForm, TripContext } from '../types';

const form = (overrides: Partial<RuleBuilderForm> = {}): RuleBuilderForm => ({
  variable: null,
  operator: 'RATE_TABLE',
  value: '0',
  rateTableCode: 'ZONAS',
  effect: 'INCREASE',
  ...overrides,
});

// ── Compilación ───────────────────────────────────────────────────────────────────────────────

describe('compileBuilder con RATE_TABLE', () => {
  it('produce un LOOKUP_TABLE contra el tarifario elegido', () => {
    expect(compileBuilder(form({ value: '150.00' }))).toEqual({
      op: 'LOOKUP_TABLE',
      table: 'ZONAS',
      fallback: { op: 'FIXED', amount: '150.00' },
    });
  });

  it('el importe del formulario es el RESPALDO, no la tarifa', () => {
    // Es la distinción que el formulario tiene que dejar clara: la tarifa la pone la tabla.
    const expr = compileBuilder(form({ value: '150.00' })) as { fallback: { amount: string } };
    expect(expr.fallback.amount).toBe('150.00');
  });

  it('"disminuye el costo" también le pone el signo al respaldo', () => {
    const expr = compileBuilder(form({ value: '50', effect: 'DECREASE' })) as { fallback: { amount: string } };
    expect(expr.fallback.amount).toBe('-50');
  });

  it('recorta el código del tarifario', () => {
    const expr = compileBuilder(form({ rateTableCode: '  ZONAS  ' })) as { table: string };
    expect(expr.table).toBe('ZONAS');
  });
});

// ── Validación ────────────────────────────────────────────────────────────────────────────────

describe('validateBuilder con RATE_TABLE', () => {
  it('exige elegir un tarifario', () => {
    expect(validateBuilder(form({ rateTableCode: '' })).rateTableCode).toBeDefined();
    expect(validateBuilder(form({ rateTableCode: '   ' })).rateTableCode).toBeDefined();
  });

  it('NO exige una variable: la clave la trae la tabla', () => {
    // El resto de los operadores sí la piden; pedirla acá obligaría a elegir algo que no se usa.
    expect(validateBuilder(form({ variable: null })).variable).toBeUndefined();
  });

  it('sigue exigiendo el respaldo sin signo', () => {
    expect(validateBuilder(form({ value: '-50' })).value).toBeDefined();
    expect(validateBuilder(form({ value: '' })).value).toBeDefined();
  });

  it('un formulario completo es válido', () => {
    expect(isBuilderValid(validateBuilder(form({ value: '150' })))).toBe(true);
  });
});

// ── Redacción ─────────────────────────────────────────────────────────────────────────────────

describe('describeBuilder con RATE_TABLE', () => {
  const ctx = { varLabel: (k: never) => varLabel(k), currency: 'USD' };

  it('nombra el tarifario y aclara qué pasa si el viaje no está', () => {
    const texto = describeBuilder(form({ value: '150.00' }), ctx);
    expect(texto).toContain('ZONAS');
    expect(texto).toContain('150.00 USD');
    expect(texto.toLowerCase()).toContain('no está en la tabla');
  });

  it('respeta la condición de la regla', () => {
    const texto = describeBuilder(form({ value: '150' }), { ...ctx, conditionText: 'la flota es propia' });
    expect(texto.startsWith('Si la flota es propia,')).toBe(true);
  });
});

// ── De punta a punta ──────────────────────────────────────────────────────────────────────────

const TARIFARIO: RateTable = {
  id: 'RT_1', countryId: 'VE', partyId: null, code: 'ZONAS', name: 'Tarifas por zona',
  keyColumns: ['originZone', 'destZone'], active: true,
};

function totalCon(
  builderForm: RuleBuilderForm,
  rows: RateTableRow[],
  trip: Partial<TripContext> = {},
): { total: string; warnings: string[] } {
  const { zoneGroups, zones, locations } = makeGeoVE();
  const input: CalculateInput = {
    country: makeCountryVE(),
    trip: makeTrip(trip),
    rules: [makeRule({
      code: 'TARIFA_BASE',
      stage: 'BASE',
      expression: compileBuilder(builderForm),
      builder: builderForm,
    })],
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
    rateTables: [TARIFARIO],
    rateTableRows: rows,
  };
  const result = calculate(input);
  return { total: result.totalLiquidado, warnings: result.warnings };
}

describe('una regla armada en el formulario cobra lo que dice el tarifario', () => {
  // El viaje de `makeTrip` va de CCS a CAR.
  const filas: RateTableRow[] = [
    { id: 'R1', tableId: 'RT_1', key: ['CCS', 'CAR'], amount: '500.00', order: 1, active: true },
    { id: 'R2', tableId: 'RT_1', key: ['CCS', '*'], amount: '300.00', order: 2, active: true },
  ];

  it('toma la fila exacta', () => {
    expect(totalCon(form({ value: '99' }), filas).total).toBe('500.00');
  });

  it('gana la más específica, no la primera', () => {
    // Con el orden invertido tiene que dar lo mismo: si ganara "la primera que cubre", el viaje
    // pagaría 300 y nadie sabría por qué.
    expect(totalCon(form({ value: '99' }), [...filas].reverse()).total).toBe('500.00');
  });

  it('cae al comodín cuando no hay fila exacta', () => {
    const soloComodin = [filas[1]!];
    expect(totalCon(form({ value: '99' }), soloComodin).total).toBe('300.00');
  });

  it('sin ninguna fila que cubra, cobra el respaldo y lo AVISA', () => {
    const { total, warnings } = totalCon(form({ value: '99.00' }), []);
    expect(total).toBe('99.00');
    // El aviso es lo que separa "no hay tarifa cargada" de "la tarifa es 99".
    expect(warnings.some((w) => w.includes('ZONAS'))).toBe(true);
  });

  it('una fila desactivada no se usa', () => {
    const desactivada: RateTableRow[] = [
      { ...filas[0]!, active: false },
    ];
    expect(totalCon(form({ value: '99' }), desactivada).total).toBe('99.00');
  });

  it('un tarifario que no existe cobra el respaldo sin romper el cálculo', () => {
    // Pasa al borrar un tarifario que una regla todavía nombra.
    const { total } = totalCon(form({ value: '99.00', rateTableCode: 'NO_EXISTE' }), filas);
    expect(total).toBe('99.00');
  });

  it('dos filas igual de específicas avisan de la ambigüedad', () => {
    const ambiguas: RateTableRow[] = [
      { id: 'A', tableId: 'RT_1', key: ['CCS', 'CAR'], amount: '500.00', order: 1, active: true },
      { id: 'B', tableId: 'RT_1', key: ['CCS', 'CAR'], amount: '700.00', order: 2, active: true },
    ];
    const { total, warnings } = totalCon(form({ value: '99' }), ambiguas);

    // Elige una de forma determinista —por orden— pero no se lo calla.
    expect(total).toBe('500.00');
    expect(warnings.some((w) => w.includes('específicas'))).toBe(true);
  });
});
