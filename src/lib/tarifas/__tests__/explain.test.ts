// "¿Por qué este total?"
//
// El motor produce todo lo necesario para responderlo y la interfaz lo tira: `line.inputs` (las
// cantidades que entraron), `line.runningSubtotal` (la cascada), `line.tableMatch` (qué fila del
// tarifario ganó) y el MOTIVO de cada descarte no se muestran en ninguna pantalla — y
// `formatInputs`, escrita justamente para eso, no tiene un solo consumidor.
//
// El requisito original del módulo era que cada cálculo se pudiera desglosar: base + variables =
// total. Estaba incumplido teniendo las dos mitades construidas.

import { describe, expect, it } from 'vitest';
import { explainCost, explainDiscards, explainLine, explainResult, variablesUsadas } from '../explain';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, RateTable, RateTableRow, Rule } from '../types';

const REGLAS: Rule[] = [
  makeRule({
    code: 'TARIFA_BASE', name: 'Tarifa del tramo', stage: 'BASE',
    conditions: { p: 'EQ', left: 'originZone', right: 'CCS' },
    expression: { op: 'FIXED', amount: '400.00' },
  }),
  makeRule({
    code: 'POR_CLIENTE', name: 'Por cliente atendido', stage: 'VARIABLE',
    conditions: { p: 'GT', left: 'clientCount', right: 0 },
    expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '2.00' },
  }),
  makeRule({
    code: 'NUNCA', name: 'Regla que no aplica', stage: 'SURCHARGE',
    conditions: { p: 'GT', left: 'incidentCount', right: 5 },
    expression: { op: 'FIXED', amount: '99.00' },
  }),
];

function calcular(overrides: Partial<CalculateInput> = {}) {
  const { zoneGroups, zones, locations } = makeGeoVE();
  return calculate({
    country: makeCountryVE(),
    trip: makeTrip({ clientCount: 40 }),
    rules: REGLAS,
    zones, zoneGroups, locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
    ...overrides,
  });
}

// ── Una línea ─────────────────────────────────────────────────────────────────────────────────

describe('explainLine', () => {
  it('dice POR QUÉ aplicó, en castellano', () => {
    const result = calcular();
    const linea = explainLine(result.trace[0]!, { rules: REGLAS });

    expect(linea.porQue).toBe('Zona de origen = CCS');
  });

  it('dice CÓMO se calculó, con las cantidades que entraron', () => {
    // Es `line.inputs`, que hoy no se muestra en ninguna pantalla.
    const result = calcular();
    const porCliente = result.trace.find((l) => l.ruleCode === 'POR_CLIENTE')!;

    expect(explainLine(porCliente, { rules: REGLAS }).como).toBe('40 × 2.00');
  });

  it('trae el acumulado, que es lo que convierte la lista en una cascada auditable', () => {
    const result = calcular();
    const lineas = result.trace.map((l) => explainLine(l, { rules: REGLAS }));

    expect(lineas.map((l) => l.acumulado)).toEqual(['400.00', '480.00']);
  });

  it('la descripción escrita a mano gana sobre la mecánica reconstruida', () => {
    // Está en castellano y dice el porqué de negocio, no cómo se multiplicó.
    const conDescripcion: Rule[] = [
      { ...REGLAS[1]!, description: 'Se paga 2,00 por cada cliente atendido en la ruta.' },
    ];
    const result = calcular({ rules: conDescripcion });

    expect(explainLine(result.trace[0]!, { rules: conDescripcion }).como)
      .toBe('Se paga 2,00 por cada cliente atendido en la ruta.');
  });

  it('dice qué fila del tarifario ganó', () => {
    // Sin esto, "Tarifa de tabla" es un número mágico.
    const tarifario: RateTable = {
      id: 'RT', countryId: 'VE', partyId: null, code: 'ZONAS', name: 'Zonas',
      keyColumns: ['originZone', 'destZone'], active: true,
    };
    const filas: RateTableRow[] = [
      { id: 'F1', tableId: 'RT', key: ['CCS', 'CAR'], amount: '777.00', order: 1, active: true },
    ];
    const reglas = [makeRule({
      code: 'DE_TABLA', stage: 'BASE',
      expression: { op: 'LOOKUP_TABLE', table: 'ZONAS', fallback: { op: 'FIXED', amount: '0' } },
    })];

    const result = calcular({ rules: reglas, rateTables: [tarifario], rateTableRows: filas });
    const linea = explainLine(result.trace[0]!, { rules: reglas });

    expect(linea.fuente).toBe('Tarifario ZONAS, fila "CCS | CAR"');
    expect(linea.monto).toBe('777.00');
  });

  it('muestra el monto corregido a mano con su motivo', () => {
    const result = calcular({
      overrides: { TARIFA_BASE: { value: '350.00', reason: 'Acuerdo puntual de septiembre' } },
    });
    const linea = explainLine(result.trace[0]!, { rules: REGLAS });

    expect(linea.override).toEqual({ value: '350.00', reason: 'Acuerdo puntual de septiembre' });
    expect(linea.monto).toBe('350.00');
  });
});

// ── Descartes ─────────────────────────────────────────────────────────────────────────────────

describe('explainDiscards', () => {
  it('agrupa por MOTIVO, que hoy se tira', () => {
    // "No se cumplió la condición", "fuera de vigencia" y "reemplazada por la compañía" son tres
    // historias distintas; la pantalla muestra sólo el detalle y pierde cuál era.
    const grupos = explainDiscards([
      { ruleCode: 'A', reason: 'CONDITION_FALSE', detail: 'no se cumplió' },
      { ruleCode: 'B', reason: 'CONDITION_FALSE', detail: 'tampoco' },
      { ruleCode: 'C', reason: 'OUT_OF_PERIOD', detail: 'venció' },
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({ reason: 'CONDITION_FALSE', reasonLabel: 'Condición no cumplida' });
    expect(grupos[0]?.rules.map((r) => r.ruleCode)).toEqual(['A', 'B']);
    expect(grupos[1]?.reasonLabel).toBe('Fuera de vigencia');
  });

  it('sin descartes no devuelve grupos', () => {
    expect(explainDiscards([])).toEqual([]);
  });
});

// ── Qué números miró el motor ─────────────────────────────────────────────────────────────────

describe('variablesUsadas', () => {
  it('lista los datos del viaje que entraron en el cálculo', () => {
    // "Cargué el peso y no cambió nada" pasa a tener una respuesta concreta: el peso no está acá.
    const result = calcular();
    const usadas = variablesUsadas(result.trace);

    expect(usadas.map((v) => v.key)).toContain('clientCount');
    expect(usadas.find((v) => v.key === 'clientCount')).toMatchObject({
      label: 'Clientes', value: '40',
    });
  });

  it('deja afuera los parámetros de la REGLA, que no son datos del viaje', () => {
    const result = calcular();
    const claves = variablesUsadas(result.trace).map((v) => v.key);

    expect(claves).not.toContain('rate');
    expect(claves).not.toContain('amount');
  });

  it('usa la etiqueta que puso la compañía en una variable propia', () => {
    const reglas = [makeRule({
      code: 'PROPIA', stage: 'VARIABLE',
      expression: { op: 'PER_UNIT', unit: 'custom:horas_espera', rate: '10' },
    })];
    const result = calcular({
      rules: reglas,
      trip: makeTrip({ customVars: { 'custom:horas_espera': 3 } }),
      partyVariables: [{
        id: 'V', partyId: 'P', key: 'custom:horas_espera', label: 'Horas de espera',
        kind: 'NUMBER', origin: 'PER_TRIP', defaultValue: '0', unit: 'h', active: true,
      }],
    });

    const usadas = variablesUsadas(result.trace, { 'custom:horas_espera': 'Horas de espera' });
    expect(usadas.find((v) => v.key === 'custom:horas_espera')?.label).toBe('Horas de espera');
  });
});

// ── La explicación completa ───────────────────────────────────────────────────────────────────

describe('explainResult', () => {
  it('agrupa por etapa, en el orden del pipeline', () => {
    const explicacion = explainResult(calcular(), { rules: REGLAS });

    expect(explicacion.stages.map((s) => s.stage)).toEqual(['BASE', 'VARIABLE']);
    expect(explicacion.stages[0]?.label).toBe('Base');
  });

  it('base + variables = total, que es el requisito original', () => {
    const explicacion = explainResult(calcular(), { rules: REGLAS });

    const base = Number(explicacion.stages.find((s) => s.stage === 'BASE')?.subtotal);
    const variables = Number(explicacion.stages.find((s) => s.stage === 'VARIABLE')?.subtotal);

    expect(base).toBe(400);
    expect(variables).toBe(80);
    expect(base + variables).toBe(Number(explicacion.total));
  });

  it('no muestra etapas vacías', () => {
    expect(explainResult(calcular(), { rules: REGLAS }).stages.map((s) => s.stage))
      .not.toContain('TAX');
  });

  it('marca las líneas destildadas en vez de esconderlas', () => {
    // Haberlas quitado es parte de la historia del número.
    const result = calcular();
    const explicacion = explainResult(result, { rules: REGLAS }, { excludedSeqs: [2], total: '400.00' });

    const lineas = explicacion.stages.flatMap((s) => s.lines);
    expect(lineas.find((l) => l.seq === 2)?.excluida).toBe(true);
    expect(lineas.find((l) => l.seq === 1)?.excluida).toBe(false);
    expect(explicacion.total).toBe('400.00');
  });

  it('trae los descartes agrupados y los avisos', () => {
    const explicacion = explainResult(calcular(), { rules: REGLAS });

    expect(explicacion.discards.some((d) => d.rules.some((r) => r.ruleCode === 'NUNCA'))).toBe(true);
    expect(explicacion.currency).toBe('USD');
  });
});

// ── El costo, con el mismo tratamiento ────────────────────────────────────────────────────────

describe('explainCost', () => {
  it('abre el desglose del costo, que hoy sólo muestra su total', () => {
    // Con estructura de costos por filas, es la mitad de la historia del margen.
    const lineas = explainCost(calcular());

    expect(lineas.length).toBeGreaterThan(0);
    expect(lineas[0]).toMatchObject({ stageLabel: 'Costo' });
    expect(lineas.map((l) => l.ruleCode)).toContain('COST_KM');
  });

  it('cada línea dice cómo se calculó', () => {
    const lineas = explainCost(calcular());
    expect(lineas.find((l) => l.ruleCode === 'COST_KM')?.como).toContain('×');
  });
});
