// Una regla que el kernel no sabe leer.
//
// El defecto que esto cierra, encontrado en uso real: los tres `switch` del evaluador —condiciones,
// expresiones y bases de porcentaje— no tenían rama por defecto. Una regla con un operador que el
// kernel no conoce (o con la expresión vacía) devolvía `undefined`, que recién explotaba tres
// marcos más adelante dentro de la librería de decimales:
//
//   Uncaught Error: [DecimalError] Invalid argument: undefined
//
// Sin decir QUÉ regla, ni POR QUÉ, y llevándose puesta la pantalla entera del alta de liquidación.
//
// Es la peor forma de falla posible en este módulo: la que no se puede atribuir. Ahora la regla se
// descarta CON NOMBRE y se frena la emisión, porque un total al que le falta una línea es plata mal
// pagada, no un detalle de presentación.

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { evaluateExpr, evaluatePred, RuleShapeError } from '../evaluator';
import {
  makeCountryVE, makeGeoVE, makeMarginPolicy, makeOutsourcedCostRate, makeOwnCostParams, makeRule,
  makeTrip,
} from './fixtures';

const conReglas = (rules: Parameters<typeof calculate>[0]['rules']) => {
  const { zoneGroups, zones, locations } = makeGeoVE();
  return calculate({
    country: makeCountryVE(),
    trip: makeTrip(),
    rules,
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [makeOutsourcedCostRate()],
    marginPolicy: makeMarginPolicy(),
  });
};

const base = () => makeRule({
  code: 'R_BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '100.00' },
});

describe('el evaluador falla con nombre y apellido', () => {
  it('una expresión con un operador desconocido no devuelve undefined: avisa cuál es', () => {
    expect(() => evaluateExpr({ op: 'INVENTADO' } as never, {} as never))
      .toThrow(RuleShapeError);
    expect(() => evaluateExpr({ op: 'INVENTADO' } as never, {} as never))
      .toThrow(/INVENTADO/);
  });

  it('una expresión vacía también, y lo dice', () => {
    expect(() => evaluateExpr({} as never, {} as never)).toThrow(/\(vacío\)/);
  });

  it('una condición con una forma desconocida no se lee como falsa en silencio', () => {
    // Leerla como falsa era lo que pasaba antes: la regla no aplicaba y nadie se enteraba.
    expect(() => evaluatePred({ p: 'QUIZAS' } as never, {} as never)).toThrow(RuleShapeError);
  });
});

describe('el cálculo completo con una regla rota', () => {
  const rota = () => makeRule({
    code: 'R_ROTA',
    name: 'Recargo inventado',
    stage: 'SURCHARGE',
    expression: { op: 'NO_EXISTE', amount: '10.00' } as never,
  });

  it('no revienta: descarta la regla y la nombra', () => {
    const result = conReglas([base(), rota()]);

    const descarte = result.discarded.find((d) => d.ruleCode === 'R_ROTA');
    expect(descarte?.reason).toBe('RULE_BROKEN');
    expect(descarte?.detail).toMatch(/NO_EXISTE/);
  });

  it('frena la emisión, porque al total le falta una línea', () => {
    // Descartarla y seguir como si nada dejaría un total de menos que nadie podría explicar.
    const result = conReglas([base(), rota()]);

    const bloqueo = result.blockingIssues.find((i) => i.code === 'REGLA_ILEGIBLE');
    expect(bloqueo?.ruleCode).toBe('R_ROTA');
    expect(bloqueo?.message).toMatch(/R_ROTA/);
  });

  it('el resto del cálculo sigue en pie', () => {
    // Una regla rota no puede apagar las otras: hay que poder ver qué sí se calculó para entender
    // qué falta.
    const result = conReglas([base(), rota()]);

    expect(result.trace.map((l) => l.ruleCode)).toEqual(['R_BASE']);
    expect(result.totalLiquidado).toBe('100.00');
  });

  it('una condición ilegible se descarta igual, desde el resolver', () => {
    const result = conReglas([
      base(),
      makeRule({
        code: 'R_COND',
        stage: 'SURCHARGE',
        expression: { op: 'FIXED', amount: '10.00' },
        conditions: { p: 'QUIZAS' } as never,
      }),
    ]);

    const descarte = result.discarded.find((d) => d.ruleCode === 'R_COND');
    expect(descarte?.reason).toBe('RULE_BROKEN');
    expect(descarte?.detail).toMatch(/QUIZAS/);
  });
});
