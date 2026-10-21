// F2 de la revisión del motor (2026-10-15): resolver / AST.
// Nota: el hallazgo A3 ("override de compañía anula la regla de país aunque no aplique") NO es un
// defecto: una regla de compañía inactiva con el mismo código es la forma de APAGAR una regla de
// país para esa compañía (scope.test.ts lo cubre). No se cambió.

import { describe, expect, it } from 'vitest';
import { ExprSchema } from '../schemas';
import { lookupRateTable } from '../evaluator/lookup';
import { parseRange } from '../rateRange';
import { compareRules } from '../resolver/evaluation';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, RateTable, RateTableRow, VarBag } from '../types';

const tabla: RateTable = {
  id: 'T', code: 'T', name: 'T', keyColumns: ['km'], active: true, valueColumns: [],
} as unknown as RateTable;
const fila = (key: string): RateTableRow =>
  ({ id: 'F1', tableId: 'T', key: [key], amount: '10', active: true, order: 1 }) as unknown as RateTableRow;

describe('M1 — rango de tarifario con valor vacío', () => {
  it('"" o texto no caen en "0..100"', () => {
    expect(lookupRateTable(tabla, [fila('0..100')], { km: '' } as unknown as VarBag)).toBeNull();
    expect(lookupRateTable(tabla, [fila('0..100')], { km: 'abc' } as unknown as VarBag)).toBeNull();
    expect(lookupRateTable(tabla, [fila('0..100')], {} as unknown as VarBag)).toBeNull();
    expect(lookupRateTable(tabla, [fila('0..100')], { km: 50 } as unknown as VarBag)).not.toBeNull();
  });
});

describe('M1 — rangos: guion, coma y bordes abiertos', () => {
  it('"-5" ya no es "hasta 5": es el número negativo', () => {
    expect(parseRange('-5')).toBeNull();
    expect(parseRange('5-')).toBeNull();
    expect(parseRange('–5')).toBeNull();
  });
  it('".." abre un extremo; el guion entre dos números sigue siendo rango', () => {
    expect(parseRange('..100')).toEqual({ from: null, to: 100 });
    expect(parseRange('301..')).toEqual({ from: 301, to: null });
    expect(parseRange('101-300')).toEqual({ from: 101, to: 300 });
    expect(parseRange('101–300')).toEqual({ from: 101, to: 300 });
  });
  it('coma con exactamente tres dígitos = miles; con 1-2 dígitos = decimal', () => {
    expect(parseRange('1,000..2,000')).toEqual({ from: 1000, to: 2000 });
    expect(parseRange('1,500..')).toEqual({ from: 1500, to: null });
    expect(parseRange('1,5..2,5')).toEqual({ from: 1.5, to: 2.5 });
    expect(parseRange('1.5..2.5')).toEqual({ from: 1.5, to: 2.5 });
  });
  it('un valor negativo exacto en la clave se compara tal cual', () => {
    const t = { ...tabla, keyColumns: ['km'] } as unknown as RateTable;
    expect(lookupRateTable(t, [fila('-5')], { km: -5 } as unknown as VarBag)).not.toBeNull();
    expect(lookupRateTable(t, [fila('-5')], { km: 3 } as unknown as VarBag)).toBeNull();
  });
});

describe('M3 — validación del AST', () => {
  it('rechaza dos escalones abiertos', () => {
    const r = ExprSchema.safeParse({
      op: 'TIERED', unit: 'km', tiers: [{ upTo: null, amount: '1' }, { upTo: null, amount: '2' }],
    });
    expect(r.success).toBe(false);
  });
  it('rechaza límites repetidos', () => {
    const r = ExprSchema.safeParse({
      op: 'TIERED', unit: 'km', tiers: [{ upTo: 100, amount: '1' }, { upTo: 100, amount: '2' }],
    });
    expect(r.success).toBe(false);
  });
  it('acepta escalones válidos', () => {
    const r = ExprSchema.safeParse({
      op: 'TIERED', unit: 'km', tiers: [{ upTo: 100, amount: '1' }, { upTo: null, amount: '2' }],
    });
    expect(r.success).toBe(true);
  });
  it('rechaza CLAMP con min > max', () => {
    const r = ExprSchema.safeParse({ op: 'CLAMP', value: { op: 'FIXED', amount: '5' }, min: '10', max: '2' });
    expect(r.success).toBe(false);
  });
});

describe('M2 — grupo MAX', () => {
  it('no repite avisos de los candidatos y el ganador conserva solo lo suyo', () => {
    const { zoneGroups, zones, locations } = makeGeoVE();
    const input: CalculateInput = {
      country: makeCountryVE(), trip: makeTrip(), zones, zoneGroups, locations,
      ...makeOwnCostStructure(), marginPolicy: makeMarginPolicy(),
      rules: [
        makeRule({ code: 'M1', stage: 'VARIABLE', stacking: 'MAX', exclusionGroup: 'G', expression: { op: 'FIXED', amount: '50' } }),
        makeRule({
          code: 'M2', stage: 'VARIABLE', stacking: 'MAX', exclusionGroup: 'G',
          expression: { op: 'LOOKUP_TABLE', table: 'NO_EXISTE', fallback: { op: 'FIXED', amount: '10' } },
        }),
      ],
    };
    const result = calculate(input);
    const lineas = result.trace.filter((l) => l.stage === 'VARIABLE');
    expect(lineas.map((l) => l.ruleCode)).toEqual(['M1']);
    expect(lineas[0]!.tableMatch).toBeUndefined();
    expect(result.warnings.filter((w) => w.includes('NO_EXISTE'))).toHaveLength(0);
  });
});

describe('orden de reglas único', () => {
  it('compareRules ordena etapa → prioridad → alcance → código', () => {
    const a = makeRule({ code: 'A', stage: 'VARIABLE', priority: 1, expression: { op: 'FIXED', amount: '1' } });
    const b = makeRule({ code: 'B', stage: 'BASE', priority: 9, expression: { op: 'FIXED', amount: '1' } });
    expect([a, b].sort(compareRules).map((r) => r.code)).toEqual(['B', 'A']);
  });
});
