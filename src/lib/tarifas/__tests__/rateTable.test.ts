// Tablas de tarifas N-dimensionales.
//
// El corazón es la regla de resolución: gana la fila MÁS ESPECÍFICA. Si eso quedara ambiguo o
// dependiera del orden en que la base devolvió las filas, un tarifario daría precios distintos para
// el mismo viaje — el mismo defecto que ya costó caro en `simulaciones.test.ts` § S1.

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { lookupRateTable } from '../evaluator';
import { keyVarsFor, validateRateRow, validateRateTable } from '../rateTablesDataSource';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostStructure, makeRule, makeTrip } from './fixtures';
import type {
  CalculateInput, PartyVariable, RateTable, RateTableRow, Rule, TripContext, VarBag,
} from '../types';

const tabla: RateTable = {
  id: 'T1',
  countryId: 'VE',
  partyId: null,
  code: 'TARIFARIO',
  name: 'Tarifario base',
  // Tres dimensiones: con el modelo viejo esto eran N reglas; acá son N filas.
  keyColumns: ['originZone', 'destZone', 'truckTypeId'],
  active: true,
};

let seq = 0;
const fila = (key: string[], amount: string, overrides: Partial<RateTableRow> = {}): RateTableRow => {
  seq += 1;
  return {
    id: `R${String(seq).padStart(3, '0')}`,
    tableId: 'T1',
    key,
    amount,
    order: seq,
    active: true,
    ...overrides,
  };
};

const vars = (overrides: Record<string, string> = {}): VarBag => ({
  originZone: 'CCS', destZone: 'CAR', truckTypeId: 'NPR', ...overrides,
} as unknown as VarBag);

// ── Resolución ────────────────────────────────────────────────────────────────────────────────

describe('lookupRateTable — coincidencia exacta', () => {
  const rows = [
    fila(['CCS', 'CAR', 'NPR'], '400'),
    fila(['CCS', 'CAR', 'NKR'], '350'),
    fila(['CCS', 'ZUL', 'NPR'], '600'),
  ];

  it('encuentra la fila de la combinación', () => {
    expect(lookupRateTable(tabla, rows, vars())?.row.amount).toBe('400');
  });

  it('cambiar una sola dimensión cambia la tarifa', () => {
    expect(lookupRateTable(tabla, rows, vars({ truckTypeId: 'NKR' }))?.row.amount).toBe('350');
    expect(lookupRateTable(tabla, rows, vars({ destZone: 'ZUL' }))?.row.amount).toBe('600');
  });

  it('devuelve null cuando ninguna fila cubre la combinación', () => {
    expect(lookupRateTable(tabla, rows, vars({ truckTypeId: 'FRR' }))).toBeNull();
  });
});

describe('comodines y especificidad', () => {
  // Una fila general para toda la ruta, y una puntual para un camión: el caso típico de un
  // tarifario real ("todo Caracas-Carabobo a 400, salvo el cabezal que va a 900").
  const rows = [
    fila(['CCS', 'CAR', '*'], '400'),
    fila(['CCS', 'CAR', 'CABEZAL'], '900'),
    fila(['*', '*', '*'], '250'),
  ];

  it('el comodín cubre lo que no está declarado', () => {
    expect(lookupRateTable(tabla, rows, vars({ truckTypeId: 'NPR' }))?.row.amount).toBe('400');
  });

  it('la fila más específica le gana a la general', () => {
    expect(lookupRateTable(tabla, rows, vars({ truckTypeId: 'CABEZAL' }))?.row.amount).toBe('900');
  });

  it('la fila totalmente comodín actúa de respaldo dentro de la tabla', () => {
    expect(lookupRateTable(tabla, rows, vars({ originZone: 'ZUL', destZone: 'CCS' }))?.row.amount).toBe('250');
  });

  it('informa cuántas columnas resolvió de forma exacta', () => {
    expect(lookupRateTable(tabla, rows, vars({ truckTypeId: 'CABEZAL' }))?.match.specificity).toBe(3);
    expect(lookupRateTable(tabla, rows, vars({ originZone: 'ZUL' }))?.match.specificity).toBe(0);
  });

  it('deja ver qué clave ganó, para poder auditarlo', () => {
    expect(lookupRateTable(tabla, rows, vars())?.match.matchedKey).toBe('CCS | CAR | *');
  });
});

describe('determinismo', () => {
  it('el resultado NO depende del orden en que llegan las filas', () => {
    const a = fila(['CCS', 'CAR', '*'], '400');
    const b = fila(['CCS', 'CAR', 'NPR'], '500');

    const enUnOrden = lookupRateTable(tabla, [a, b], vars())?.row.amount;
    const enElOtro = lookupRateTable(tabla, [b, a], vars())?.row.amount;

    expect(enUnOrden).toBe('500');
    expect(enElOtro).toBe('500');
  });

  it('cuando dos filas empatan en especificidad, avisa que la tabla es ambigua', () => {
    // "Todo lo que sale de CCS" y "todo lo que lleva un NPR" son igual de específicas, y las dos
    // aplican. El desempate por orden existe, pero nadie lo eligió a propósito.
    const rows = [
      fila(['CCS', '*', '*'], '400'),
      fila(['*', '*', 'NPR'], '450'),
    ];
    const found = lookupRateTable(tabla, rows, vars());

    expect(found?.tiedWith).toHaveLength(1);
    expect(found?.row.amount).toBe('400'); // gana por `order`, de forma determinista
  });

  it('sin empate no hay ambigüedad que reportar', () => {
    const rows = [fila(['CCS', 'CAR', 'NPR'], '400'), fila(['*', '*', '*'], '250')];
    expect(lookupRateTable(tabla, rows, vars())?.tiedWith).toHaveLength(0);
  });

  it('una fila inactiva no participa', () => {
    const rows = [
      fila(['CCS', 'CAR', 'NPR'], '400', { active: false }),
      fila(['*', '*', '*'], '250'),
    ];
    expect(lookupRateTable(tabla, rows, vars())?.row.amount).toBe('250');
  });
});

// ── De punta a punta ──────────────────────────────────────────────────────────────────────────

function run(rules: Rule[], rows: RateTableRow[], trip: Partial<TripContext> = {}, tables = [tabla]) {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  const input: CalculateInput = {
    country,
    trip: makeTrip(trip),
    rules,
    zones,
    zoneGroups,
    locations,
    rateTables: tables,
    rateTableRows: rows,
    ...makeOwnCostStructure(),
    marginPolicy: makeMarginPolicy(),
  };
  return calculate(input);
}

const reglaTabla = (fallback = '0') => makeRule({
  code: 'BASE_TABLA',
  stage: 'BASE',
  expression: { op: 'LOOKUP_TABLE', table: 'TARIFARIO', fallback: { op: 'FIXED', amount: fallback } },
});

describe('una regla que busca en la tabla', () => {
  it('cobra la tarifa de la fila que corresponde', () => {
    const result = run([reglaTabla()], [fila(['CCS', 'CAR', 'TT_350'], '400')]);
    expect(result.totalLiquidado).toBe('400.00');
  });

  it('el desglose dice qué fila la resolvió', () => {
    const result = run([reglaTabla()], [fila(['CCS', 'CAR', '*'], '400')]);

    expect(result.trace[0]?.tableMatch).toMatchObject({
      tableCode: 'TARIFARIO',
      matchedKey: 'CCS | CAR | *',
      specificity: 2,
    });
  });

  it('sin fila que cubra el viaje usa el respaldo y avisa cuál clave faltó', () => {
    const result = run([reglaTabla('120')], [fila(['ZUL', 'CCS', 'NPR'], '400')]);

    expect(result.totalLiquidado).toBe('120.00');
    expect(result.warnings.some((w) => w.includes('no tiene fila para'))).toBe(true);
  });

  it('si la tabla no existe, avisa y usa el respaldo en vez de romper', () => {
    const result = run([reglaTabla('99')], [], {}, []);

    expect(result.totalLiquidado).toBe('99.00');
    expect(result.warnings.some((w) => w.includes('no existe o está inactiva'))).toBe(true);
  });

  it('el aviso de tabla ambigua llega al resultado', () => {
    const result = run([reglaTabla()], [
      fila(['CCS', '*', '*'], '400'),
      fila(['*', '*', 'TT_350'], '450'),
    ]);

    expect(result.warnings.some((w) => w.includes('igual de específicas'))).toBe(true);
  });
});

describe('lo que reemplaza', () => {
  it('cinco zonas por cuatro camiones son filas, no reglas', () => {
    // Con el modelo anterior cada combinación necesitaba su propia regla condicionada. Acá una
    // sola regla y una tabla resuelven las 20 — y agregar un camión es agregar una fila.
    const rows = [
      fila(['CCS', 'CAR', 'TT_350'], '400'),
      fila(['CCS', 'CAR', 'TT_750'], '650'),
      fila(['CCS', 'ZUL', 'TT_350'], '600'),
      fila(['CCS', 'ZUL', 'TT_750'], '900'),
    ];

    expect(run([reglaTabla()], rows, { truckTypeId: 'TT_350' }).totalLiquidado).toBe('400.00');
    expect(run([reglaTabla()], rows, { truckTypeId: 'TT_750' }).totalLiquidado).toBe('650.00');
  });
});

describe('claves con variables personalizadas de la compañía', () => {
  const existing: Parameters<typeof validateRateTable>[1] = [];
  const base = { countryId: 'VE', code: 'TARIFA', name: 'Tarifa', active: true };
  const variable = (key: `custom:${string}`, active = true): PartyVariable => ({
    id: key, partyId: 'P1', key, label: key, kind: 'TEXT', origin: 'PER_TRIP', defaultValue: null, unit: null, active,
  });

  it('el tarifario de una compañía acepta una variable personalizada activa en la clave', () => {
    const errors = validateRateTable(
      { ...base, partyId: 'P1', keyColumns: ['destZone', 'custom:tipo_carga'] }, existing, undefined,
      [variable('custom:tipo_carga')],
    );
    expect(errors.keyColumns).toBeUndefined();
  });

  it('un tarifario del país no puede usar variables personalizadas', () => {
    const errors = validateRateTable(
      { ...base, partyId: null, keyColumns: ['custom:tipo_carga'] }, existing, undefined, [variable('custom:tipo_carga')],
    );
    expect(errors.keyColumns).toMatch(/compañía/);
  });

  it('una variable inexistente o desactivada se rechaza al guardar', () => {
    const inexistente = validateRateTable({ ...base, partyId: 'P1', keyColumns: ['custom:otra'] }, existing, undefined, []);
    expect(inexistente.keyColumns).toMatch(/custom:otra/);
    const inactiva = validateRateTable(
      { ...base, partyId: 'P1', keyColumns: ['custom:tipo_carga'] }, existing, undefined, [variable('custom:tipo_carga', false)],
    );
    expect(inactiva.keyColumns).toMatch(/custom:tipo_carga/);
  });

  it('keyVarsFor suma las variables activas de la compañía a las del sistema', () => {
    const keys = keyVarsFor([variable('custom:a'), variable('custom:b', false)]);
    expect(keys).toContain('destZone');
    expect(keys).toContain('custom:a');
    expect(keys).not.toContain('custom:b');
  });
});

describe('rangos en la clave del tarifario', () => {
  const rows = (cells: string[][]): RateTableRow[] => cells.map((key, i) => ({
    id: `r${i}`, tableId: 'TR', key, amount: String((i + 1) * 100), order: i, active: true,
  }));
  const tabla: RateTable = {
    id: 'TR', countryId: 'VE', partyId: null, code: 'KM', name: 'Por km', keyColumns: ['destZone', 'km'], active: true,
  };

  it('181 km cae en el tramo 101..300 aunque ninguna fila diga 181', () => {
    const r = lookupRateTable(tabla, rows([['CCS', '0..100'], ['CCS', '101..300'], ['CCS', '301..']]), { destZone: 'CCS', km: 181 } as never);
    expect(r?.row.id).toBe('r1');
    expect(r?.match.matchedKey).toBe('CCS | 101..300');
  });

  it('los extremos están incluidos y el tramo abierto cubre el resto', () => {
    const filas = rows([['CCS', '0..100'], ['CCS', '101..300'], ['CCS', '301..']]);
    const idDe = (km: number) => lookupRateTable(tabla, filas, { destZone: 'CCS', km } as never)?.row.id;
    expect(idDe(100)).toBe('r0');
    expect(idDe(101)).toBe('r1');
    expect(idDe(300)).toBe('r1');
    expect(idDe(5000)).toBe('r2');
  });

  it('un valor sin tramo (hueco) no casa y el comodín sigue valiendo', () => {
    const filas = rows([['CCS', '0..100'], ['CCS', '*']]);
    expect(lookupRateTable(tabla, filas, { destZone: 'CCS', km: 150 } as never)?.row.id).toBe('r1');
    expect(lookupRateTable(tabla, rows([['CCS', '0..100']]), { destZone: 'CCS', km: 150 } as never)).toBeNull();
  });
});

describe('validación de rangos al guardar una fila', () => {
  const tabla: RateTable = {
    id: 'TR', countryId: 'VE', partyId: null, code: 'KM', name: 'Por km', keyColumns: ['destZone', 'km'], active: true,
  };
  const fila = (key: string[], id = 'x') => ({ tableId: 'TR', key, amount: '100', active: true, id });
  const existente = { id: 'e1', tableId: 'TR', key: ['CCS', '0..100'], amount: '50', order: 0, active: true } as RateTableRow;

  it('acepta un rango bien formado en una columna numérica', () => {
    expect(validateRateRow(fila(['CCS', '101..300']), tabla, [existente]).key).toBeUndefined();
  });
  it('rechaza un rango al revés, mal escrito o en una columna que no es numérica', () => {
    expect(validateRateRow(fila(['CCS', '300..100']), tabla, []).key).toMatch(/al revés/);
    expect(validateRateRow(fila(['CCS', '10..x']), tabla, []).key).toMatch(/rango válido/);
    expect(validateRateRow(fila(['1..5', '10..20']), tabla, []).key).toMatch(/no es numérica/);
  });
  it('rechaza dos tramos que se pisan en la misma combinación', () => {
    expect(validateRateRow(fila(['CCS', '50..150']), tabla, [existente]).key).toMatch(/pisa/);
    // Otra zona: no se pisan.
    expect(validateRateRow(fila(['CAR', '50..150']), tabla, [existente]).key).toBeUndefined();
  });
});
