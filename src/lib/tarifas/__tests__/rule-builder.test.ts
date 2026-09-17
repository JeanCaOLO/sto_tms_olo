// El formulario visual: que lo que la persona arma sea exactamente lo que el motor ejecuta, y que
// la frase que lee describa ese mismo cálculo. Son tests de lógica pura — no montan React.

import { describe, expect, it } from 'vitest';
import {
  collectVarKeys, compileBuilder, compileConditions, customVarKey, describeBuilder,
  emptyConditionRow, findMissingCustomVars, isBuilderValid, percentToFraction, validateBuilder,
  validateConditionRows,
} from '../rule-builder';
import { varLabel } from '../format';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type {
  CalculateInput, ConditionBuilderForm, ConditionRowForm, PartyVariable, RuleBuilderForm,
  TripContext,
} from '../types';

const form = (overrides: Partial<RuleBuilderForm> = {}): RuleBuilderForm => ({
  variable: 'tollCount',
  operator: 'TIMES',
  value: '20',
  effect: 'INCREASE',
  ...overrides,
});

const ctx = { varLabel: (k: never) => varLabel(k), currency: 'USD' };

// ── Compilación ───────────────────────────────────────────────────────────────────────────────

describe('compileBuilder', () => {
  it('monto fijo', () => {
    expect(compileBuilder(form({ operator: 'FIXED', variable: null, value: '400' })))
      .toEqual({ op: 'FIXED', amount: '400' });
  });

  it('por cada unidad', () => {
    expect(compileBuilder(form()))
      .toEqual({ op: 'PER_UNIT', unit: 'tollCount', rate: '20' });
  });

  it('cada N unidades', () => {
    expect(compileBuilder(form({ operator: 'PER_BLOCK', blockSize: 10, value: '15' })))
      .toEqual({ op: 'PER_BLOCK', unit: 'tollCount', blockSize: 10, amount: '15' });
  });

  it('porcentaje: el usuario escribe 20 y el motor recibe la fracción 0.2', () => {
    const expr = compileBuilder(
      form({ operator: 'PERCENT', value: '20', percentBase: { of: 'STAGE_SUBTOTAL', stage: 'BASE' } }),
    );
    expect(expr).toEqual({ op: 'PERCENT', pct: '0.2', base: { of: 'STAGE_SUBTOTAL', stage: 'BASE' } });
  });
});

describe('el efecto es lo único que pone el signo', () => {
  it('disminuir invierte el importe fijo', () => {
    expect(compileBuilder(form({ operator: 'FIXED', variable: null, value: '400', effect: 'DECREASE' })))
      .toEqual({ op: 'FIXED', amount: '-400' });
  });

  it('disminuir invierte la tasa por unidad', () => {
    expect(compileBuilder(form({ effect: 'DECREASE' })))
      .toEqual({ op: 'PER_UNIT', unit: 'tollCount', rate: '-20' });
  });

  it('disminuir invierte el porcentaje', () => {
    expect(percentToFraction('3', 'DECREASE')).toBe('-0.03');
    expect(percentToFraction('3', 'INCREASE')).toBe('0.03');
  });

  it('el formulario rechaza un importe con signo: hay una sola forma de expresarlo', () => {
    const errors = validateBuilder(form({ value: '-20' }));
    expect(errors.value).toBeDefined();
    expect(errors.value).toContain('Disminuye');
  });
});

describe('validación', () => {
  it('exige variable salvo en monto fijo', () => {
    expect(validateBuilder(form({ variable: null })).variable).toBeDefined();
    expect(isBuilderValid(validateBuilder(form({ operator: 'FIXED', variable: null, value: '10' })))).toBe(true);
  });

  it('exige tamaño de bloque mayor que cero', () => {
    expect(validateBuilder(form({ operator: 'PER_BLOCK', blockSize: 0 })).blockSize).toBeDefined();
    expect(validateBuilder(form({ operator: 'PER_BLOCK', blockSize: 10 })).blockSize).toBeUndefined();
  });

  it('exige base para el porcentaje', () => {
    expect(validateBuilder(form({ operator: 'PERCENT', percentBase: undefined })).percentBase).toBeDefined();
  });
});

// ── Redacción ─────────────────────────────────────────────────────────────────────────────────

describe('describeBuilder', () => {
  it('redacta el ejemplo del requerimiento', () => {
    expect(describeBuilder(form(), ctx))
      .toBe('Por cada unidad de cantidad de peajes se suma 20 USD.');
  });

  it('redacta un descuento', () => {
    expect(describeBuilder(form({ operator: 'FIXED', variable: null, value: '50', effect: 'DECREASE' }), ctx))
      .toBe('Se descuenta 50 USD al total.');
  });

  it('redacta bloques', () => {
    expect(describeBuilder(form({ operator: 'PER_BLOCK', blockSize: 10, value: '15' }), ctx))
      .toBe('Cada 10 de cantidad de peajes se suma 15 USD.');
  });

  it('incorpora la condición cuando la hay', () => {
    const texto = describeBuilder(form({ operator: 'FIXED', variable: null, value: '10' }), {
      ...ctx,
      conditionText: 'Cantidad de peajes > 20',
    });
    expect(texto).toBe('Si cantidad de peajes > 20, se suma 10 USD al total.');
  });

  it('usa la moneda que se le pase', () => {
    expect(describeBuilder(form({ operator: 'FIXED', variable: null, value: '500' }), { ...ctx, currency: 'CRC' }))
      .toContain('500 CRC');
  });
});

// ── Variables usadas ──────────────────────────────────────────────────────────────────────────

describe('collectVarKeys', () => {
  it('junta las de la condición y las de la expresión, sin repetir', () => {
    const rule = {
      conditions: { p: 'GT', left: 'tollCount', right: 20 } as never,
      expression: { op: 'PER_UNIT', unit: 'tollCount', rate: '20' } as never,
    };
    expect(collectVarKeys(rule)).toEqual(['tollCount']);
  });

  it('entra en condiciones compuestas', () => {
    const rule = {
      conditions: {
        p: 'AND',
        args: [
          { p: 'EQ', left: 'truckTypeId', right: 'NPR' },
          { p: 'NOT', arg: { p: 'GT', left: 'lateMinutes', right: 0 } },
        ],
      } as never,
      expression: { op: 'PER_KM', rate: '1' } as never,
    };
    expect(collectVarKeys(rule).sort()).toEqual(['km', 'lateMinutes', 'truckTypeId']);
  });

  it('detecta variables personalizadas que la compañía ya no tiene declaradas', () => {
    const declared: Pick<PartyVariable, 'key' | 'active'>[] = [
      { key: 'custom:horas_espera', active: true },
      { key: 'custom:bono_viejo', active: false },
    ];
    const rule = {
      conditions: { p: 'GT', left: 'custom:bono_viejo', right: 0 } as never,
      expression: { op: 'PER_UNIT', unit: 'custom:horas_espera', rate: '5' } as never,
    };

    expect(findMissingCustomVars(rule, declared)).toEqual(['custom:bono_viejo']);
  });
});

describe('customVarKey', () => {
  it('normaliza con prefijo y no lo duplica', () => {
    expect(customVarKey('horas_espera')).toBe('custom:horas_espera');
    expect(customVarKey('custom:horas_espera')).toBe('custom:horas_espera');
  });
});

// ── De punta a punta: lo armado en el formulario es lo que cobra el motor ──────────────────────

function runWithBuilder(builderForm: RuleBuilderForm, trip: Partial<TripContext> = {}, partyVariables: PartyVariable[] = []) {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  const rule = makeRule({
    code: 'VISUAL',
    stage: 'SURCHARGE',
    expression: compileBuilder(builderForm),
    builder: builderForm,
    effect: builderForm.effect,
  });
  const input: CalculateInput = {
    country,
    trip: makeTrip(trip),
    rules: [rule],
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
    partyVariables,
  };
  return calculate(input);
}

describe('de la forma visual al total', () => {
  it('"por cada peaje, 20" con 3 peajes cobra 60', () => {
    expect(runWithBuilder(form(), { tollCount: 3 }).totalLiquidado).toBe('60.00');
  });

  it('el mismo caso marcado como descuento resta', () => {
    expect(runWithBuilder(form({ effect: 'DECREASE' }), { tollCount: 3 }).totalLiquidado).toBe('-60.00');
  });

  it('una variable personalizada constante se resuelve desde su declaración', () => {
    const variables: PartyVariable[] = [{
      id: 'V1', partyId: 'P1', key: 'custom:horas_espera', label: 'Horas de espera',
      kind: 'NUMBER', origin: 'CONSTANT', defaultValue: '4', unit: 'h', active: true,
    }];

    const result = runWithBuilder(
      form({ variable: 'custom:horas_espera', value: '5' }),
      { partyId: 'P1' },
      variables,
    );

    expect(result.totalLiquidado).toBe('20.00'); // 4 h x 5
  });

  it('una variable por viaje toma el valor cargado, y el por defecto si no se cargó', () => {
    const variables: PartyVariable[] = [{
      id: 'V2', partyId: 'P1', key: 'custom:horas_espera', label: 'Horas de espera',
      kind: 'NUMBER', origin: 'PER_TRIP', defaultValue: '1', unit: 'h', active: true,
    }];
    const builderForm = form({ variable: 'custom:horas_espera', value: '5' });

    const cargado = runWithBuilder(builderForm, { partyId: 'P1', customVars: { 'custom:horas_espera': 6 } }, variables);
    expect(cargado.totalLiquidado).toBe('30.00'); // 6 x 5

    const sinCargar = runWithBuilder(builderForm, { partyId: 'P1' }, variables);
    expect(sinCargar.totalLiquidado).toBe('5.00'); // por defecto 1 x 5
  });

  it('una variable desactivada no aporta valor, avisa, y NO rompe la liquidación', () => {
    const variables: PartyVariable[] = [{
      id: 'V3', partyId: 'P1', key: 'custom:bono', label: 'Bono',
      kind: 'NUMBER', origin: 'CONSTANT', defaultValue: '10', unit: null, active: false,
    }];

    const result = runWithBuilder(form({ variable: 'custom:bono', value: '5' }), { partyId: 'P1' }, variables);

    expect(result.totalLiquidado).toBe('0.00');
    expect(result.warnings.some((w) => w.includes('custom:bono'))).toBe(true);
  });

  it('una regla que apunta a una variable inexistente tampoco rompe el cálculo', () => {
    const result = runWithBuilder(form({ variable: 'custom:no_existe', value: '5' }), { partyId: 'P1' });

    expect(result.totalLiquidado).toBe('0.00');
    expect(result.warnings.some((w) => w.includes('no existe en este viaje'))).toBe(true);
  });
});

// ── Fase 9 (A3) — tope y piso sobre el resultado ya calculado ──────────────────────────────────

describe('clamp: tope y piso', () => {
  it('sin bordes, compila igual que antes', () => {
    expect(compileBuilder(form())).toEqual({ op: 'PER_UNIT', unit: 'tollCount', rate: '20' });
  });

  it('con tope, envuelve la expresión en CLAMP', () => {
    expect(compileBuilder(form({ clamp: { max: '100' } })))
      .toEqual({ op: 'CLAMP', value: { op: 'PER_UNIT', unit: 'tollCount', rate: '20' }, max: '100' });
  });

  it('con piso y tope, "el recargo no puede pasar de X" con 10 peajes cobra el tope, no 200', () => {
    const result = runWithBuilder(form({ clamp: { min: '5', max: '100' } }), { tollCount: 10 });
    expect(result.totalLiquidado).toBe('100.00');
  });

  it('el piso no puede ser mayor que el tope', () => {
    expect(validateBuilder(form({ clamp: { min: '100', max: '5' } })).clamp).toBeDefined();
    expect(validateBuilder(form({ clamp: { min: '5', max: '100' } })).clamp).toBeUndefined();
  });

  it('se redacta en la descripción automática', () => {
    expect(describeBuilder(form({ operator: 'FIXED', variable: null, value: '400', clamp: { max: '300' } }), ctx))
      .toBe('Se suma 400 USD al total, sin pasar de 300 USD.');
  });
});

// ── Fase 9 (A1/A2) — condición visual: reabre en formulario, y ahora con O/NO/IN/BETWEEN ────────

const row = (overrides: Partial<ConditionRowForm> = {}): ConditionRowForm => ({
  ...emptyConditionRow(),
  ...overrides,
});

describe('compileConditions', () => {
  it('siempre, sin filas', () => {
    expect(compileConditions({ mode: 'always', combinator: 'AND', rows: [] })).toEqual({ p: 'ALWAYS' });
  });

  it('una sola fila no envuelve en AND', () => {
    const form_: ConditionBuilderForm = {
      mode: 'rows', combinator: 'AND', rows: [row({ left: 'tollCount', op: 'GT', right: '20' })],
    };
    expect(compileConditions(form_)).toEqual({ p: 'GT', left: 'tollCount', right: 20 });
  });

  it('A2: combina varias filas con OR, no solo AND', () => {
    const form_: ConditionBuilderForm = {
      mode: 'rows',
      combinator: 'OR',
      rows: [
        row({ left: 'truckTypeId', op: 'EQ', right: 'NPR' }),
        row({ left: 'truckTypeId', op: 'EQ', right: 'FRR' }),
      ],
    };
    expect(compileConditions(form_)).toEqual({
      p: 'OR',
      args: [
        { p: 'EQ', left: 'truckTypeId', right: 'NPR' },
        { p: 'EQ', left: 'truckTypeId', right: 'FRR' },
      ],
    });
  });

  it('A2: NO envuelve la fila en NOT', () => {
    const form_: ConditionBuilderForm = {
      mode: 'rows', combinator: 'AND', rows: [row({ left: 'lateMinutes', op: 'GT', right: '0', negate: true })],
    };
    expect(compileConditions(form_)).toEqual({ p: 'NOT', arg: { p: 'GT', left: 'lateMinutes', right: 0 } });
  });

  it('A2: IN compila la lista separada por comas', () => {
    const form_: ConditionBuilderForm = {
      mode: 'rows', combinator: 'AND', rows: [row({ left: 'truckTypeId', op: 'IN', values: 'NPR, FRR , GVR' })],
    };
    expect(compileConditions(form_)).toEqual({ p: 'IN', left: 'truckTypeId', values: ['NPR', 'FRR', 'GVR'] });
  });

  it('A2: BETWEEN compila desde y hasta como números', () => {
    const form_: ConditionBuilderForm = {
      mode: 'rows', combinator: 'AND', rows: [row({ left: 'km', op: 'BETWEEN', from: '100', to: '300' })],
    };
    expect(compileConditions(form_)).toEqual({ p: 'BETWEEN', left: 'km', from: 100, to: 300 });
  });

  it('filas vacías se descartan, no bloquean', () => {
    const form_: ConditionBuilderForm = {
      mode: 'rows',
      combinator: 'AND',
      rows: [row({ left: 'tollCount', op: 'GT', right: '' }), row({ left: 'km', op: 'GT', right: '50' })],
    };
    expect(compileConditions(form_)).toEqual({ p: 'GT', left: 'km', right: 50 });
  });
});

describe('validateConditionRows', () => {
  it('BETWEEN con desde mayor que hasta, marca la fila', () => {
    const form_: ConditionBuilderForm = {
      mode: 'rows', combinator: 'AND', rows: [row({ left: 'km', op: 'BETWEEN', from: '300', to: '100' })],
    };
    expect(validateConditionRows(form_)[0]).toBeDefined();
  });

  it('sin filas problemáticas, no marca nada', () => {
    const form_: ConditionBuilderForm = {
      mode: 'rows', combinator: 'AND', rows: [row({ left: 'km', op: 'BETWEEN', from: '100', to: '300' })],
    };
    expect(validateConditionRows(form_)).toEqual({});
  });

  it('en modo "siempre" o "avanzado" no valida filas', () => {
    const form_: ConditionBuilderForm = {
      mode: 'always', combinator: 'AND', rows: [row({ left: 'km', op: 'BETWEEN', from: '300', to: '100' })],
    };
    expect(validateConditionRows(form_)).toEqual({});
  });
});

describe('A2 de punta a punta: OR e IN deciden si la regla aplica', () => {
  it('OR de dos tipos de camión aplica con cualquiera de los dos', () => {
    const conditions = compileConditions({
      mode: 'rows',
      combinator: 'OR',
      rows: [
        row({ left: 'truckTypeId', op: 'EQ', right: 'NPR' }),
        row({ left: 'truckTypeId', op: 'EQ', right: 'FRR' }),
      ],
    });
    const country = makeCountryVE();
    const { zoneGroups, zones, locations } = makeGeoVE();
    const rule = makeRule({
      code: 'OR_RULE', stage: 'SURCHARGE', conditions, expression: { op: 'FIXED', amount: '50' },
    });
    const input: CalculateInput = {
      country, trip: makeTrip({ truckTypeId: 'FRR' }), rules: [rule], zones, zoneGroups, locations,
      ownCostParams: makeOwnCostParams(), outsourcedCostRates: [], marginPolicy: makeMarginPolicy(),
    };
    expect(calculate(input).totalLiquidado).toBe('50.00');
  });
});
