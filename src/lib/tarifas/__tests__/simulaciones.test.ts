// SIMULACIONES ADVERSARIALES.
//
// Este archivo no prueba que el motor funcione: prueba que NO falle en situaciones que un día van a
// pasar en producción. Cada bloque describe una situación realista y afirma lo que el sistema
// DEBERÍA hacer. Si un caso falla, es un hueco real, no un test mal escrito.

import { describe, expect, it } from 'vitest';
import { calculate } from '../index';
import {
  makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip,
} from './fixtures';
import type { CalculateInput, Country, Rule, TripContext } from '../types';

function run(rules: Rule[], trip: Partial<TripContext> = {}, extra: Partial<CalculateInput> = {}) {
  const country = makeCountryVE();
  const { zoneGroups, zones, locations } = makeGeoVE();
  return calculate({
    country,
    trip: makeTrip(trip),
    rules,
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
    ...extra,
  });
}

// ══ S1 ═══ Dos reglas iguales en etapa y prioridad ════════════════════════════════════════════
// Situación: alguien crea dos recargos SUM en la misma etapa y deja la prioridad por defecto (10).
// Riesgo: si el orden depende del orden de llegada de los datos, el MISMO viaje puede dar totales
// distintos según cómo vengan ordenadas las reglas — y con PERCENT sobre el subtotal acumulado, el
// total cambia de verdad.
describe('S1 · empate de prioridad', () => {
  const fijo = () => makeRule({
    code: 'FIJO', stage: 'BASE', priority: 10, stacking: 'SUM',
    expression: { op: 'FIXED', amount: '100.00' },
  });
  const porcentaje = () => makeRule({
    code: 'PCT', stage: 'BASE', priority: 10, stacking: 'SUM',
    expression: { op: 'PERCENT', pct: '0.10', base: { of: 'RUNNING_SUBTOTAL' } },
  });

  it('el total NO debería depender del orden en que llegan las reglas', () => {
    const enUnOrden = run([fijo(), porcentaje()]).totalLiquidado;
    const enElOtro = run([porcentaje(), fijo()]).totalLiquidado;

    expect(enUnOrden).toBe(enElOtro);
  });
});

// ══ S2 ═══ Porcentaje sobre una regla que se evalúa después ═══════════════════════════════════
// Situación: "IVA = 16% de la tarifa base", pero la regla base quedó en una etapa posterior.
// Riesgo: hoy devuelve 0 con un aviso. El total sale mal y nadie mira los avisos.
describe('S2 · porcentaje sobre una regla posterior', () => {
  const rules = [
    makeRule({
      code: 'IVA', stage: 'BASE', priority: 10, stacking: 'SUM',
      expression: { op: 'PERCENT', pct: '0.16', base: { of: 'RULE', ruleCode: 'TARIFA' } },
    }),
    makeRule({
      code: 'TARIFA', stage: 'SURCHARGE', priority: 10, stacking: 'SUM',
      expression: { op: 'FIXED', amount: '1000.00' },
    }),
  ];

  it('avisa que la base no estaba disponible', () => {
    expect(run(rules).warnings.some((w) => w.includes('TARIFA'))).toBe(true);
  });

  it('el aviso debería ser BLOQUEANTE, no un texto que nadie lee', () => {
    // Un total al que le falta el 16% no es "un total con una advertencia": es un total equivocado.
    const result = run(rules);
    expect(result.blockingIssues ?? []).toContainEqual(
      expect.objectContaining({ code: 'BASE_NO_DISPONIBLE' }),
    );
  });
});

// ══ S3 ═══ Referencia circular entre reglas ═══════════════════════════════════════════════════
describe('S3 · ciclo entre reglas', () => {
  const rules = [
    makeRule({
      code: 'A', stage: 'BASE', priority: 10,
      expression: { op: 'PERCENT', pct: '0.10', base: { of: 'RULE', ruleCode: 'B' } },
    }),
    makeRule({
      code: 'B', stage: 'BASE', priority: 20,
      expression: { op: 'PERCENT', pct: '0.10', base: { of: 'RULE', ruleCode: 'A' } },
    }),
  ];

  it('no debería reventar', () => {
    expect(() => run(rules)).not.toThrow();
  });

  it('debería detectar el ciclo explícitamente, no resolverlo como 0', () => {
    expect(run(rules).blockingIssues ?? []).toContainEqual(
      expect.objectContaining({ code: 'REFERENCIA_CIRCULAR' }),
    );
  });
});

// ══ S4 ═══ Grupo MAX donde las reglas dependen del subtotal ═══════════════════════════════════
// Situación: dos recargos por incidente compiten; uno es fijo, el otro un % del acumulado.
// Riesgo: para decidir quién gana, el resolver evalúa con subtotales en CERO, así que el
// porcentaje siempre vale 0 y pierde SIEMPRE, aunque en la realidad fuera mayor.
describe('S4 · MAX con una regla basada en porcentaje', () => {
  const rules = [
    makeRule({
      code: 'BASE', stage: 'BASE', priority: 10,
      expression: { op: 'FIXED', amount: '1000.00' },
    }),
    makeRule({
      code: 'INC_FIJO', stage: 'SURCHARGE', priority: 10, stacking: 'MAX',
      exclusionGroup: 'incidentes',
      conditions: { p: 'GT', left: 'incidentCount', right: 0 },
      expression: { op: 'FIXED', amount: '15.00' },
    }),
    makeRule({
      code: 'INC_PCT', stage: 'SURCHARGE', priority: 20, stacking: 'MAX',
      exclusionGroup: 'incidentes',
      conditions: { p: 'GT', left: 'incidentCount', right: 0 },
      expression: { op: 'PERCENT', pct: '0.10', base: { of: 'STAGE_SUBTOTAL', stage: 'BASE' } },
    }),
  ];

  it('debería ganar la que de verdad es mayor: 10% de 1000 = 100 > 15', () => {
    const result = run(rules, { incidentCount: 2 });
    const aplicadas = result.trace.map((l) => l.ruleCode);
    expect(aplicadas).toContain('INC_PCT');
  });

  it('y el descarte del perdedor debe explicar los montos comparados', () => {
    const result = run(rules, { incidentCount: 2 });
    const perdedora = result.discarded.find((d) => d.ruleCode === 'INC_FIJO');

    expect(perdedora?.reason).toBe('LOST_MAX');
    // Sin los montos reales en el texto, "perdió el MAX" no es auditable.
    expect(perdedora?.detail).toContain('15.00');
    expect(perdedora?.detail).toContain('100.00');
  });
});

// ══ S5 ═══ Descuentos que superan la tarifa ═══════════════════════════════════════════════════
// Situación: penalización por retraso + descuento por volumen dejan el total en negativo.
// Riesgo: se emite una liquidación donde el transportista le DEBE plata a la empresa.
describe('S5 · total negativo', () => {
  const rules = [
    makeRule({ code: 'BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '100.00' } }),
    makeRule({ code: 'PENAL', stage: 'ADJUSTMENT', expression: { op: 'FIXED', amount: '-500.00' } }),
  ];

  it('el motor calcula el negativo', () => {
    expect(run(rules).totalLiquidado).toBe('-400.00');
  });

  it('debería marcarlo como algo que no se puede emitir tal cual', () => {
    expect(run(rules).blockingIssues ?? []).toContainEqual(
      expect.objectContaining({ code: 'TOTAL_NEGATIVO' }),
    );
  });
});


// ══ S7 ═══ Transportista del TMS sin perfil en el tarifador ═══════════════════════════════════
// Situación: alta un transportista en Catálogos y liquidás un viaje suyo sin haberle creado el
// perfil liquidable. Riesgo: se liquida con las reglas del país y nadie se entera de que faltaban
// las condiciones pactadas con ESE transportista.
// S7 y S8 —"transportista sin perfil" y "compañía desactivada"— probaban la resolución que mapeaba
// un transportista del TMS a una compañía del tarifador. Ese puente desapareció: la compañía se
// elige directamente, así que no hay a quién no encontrarle perfil.
//
// La garantía que SÍ sigue viva —una compañía dada de baja no pasa desapercibida— se verifica ahora
// en `settlementForm.test.ts`, donde bloquea el alta antes de calcular nada.

describe('S9 · efecto declarado que contradice al importe', () => {
  it('debería detectarse la contradicción', () => {
    const rule = makeRule({
      code: 'CONTRADICTORIA', stage: 'SURCHARGE',
      effect: 'INCREASE',
      expression: { op: 'FIXED', amount: '-50.00' },
    });
    const result = run([rule]);

    expect(result.warnings.some((w) => w.includes('CONTRADICTORIA'))).toBe(true);
  });
});

// ══ S10 ══ Regla de compañía que pierde contra la de país ═════════════════════════════════════
// Situación: el país tiene una tarifa EXCLUSIVE con prioridad 10; la compañía crea la suya con
// prioridad por defecto y OTRO código. Riesgo: la de la compañía nunca gana y el usuario no
// entiende por qué su regla "no hace nada".
describe('S10 · la regla propia de la compañía pierde sin explicación clara', () => {
  const rules = [
    makeRule({
      code: 'TARIFA_PAIS', stage: 'BASE', priority: 10, stacking: 'EXCLUSIVE',
      scope: 'COUNTRY', expression: { op: 'FIXED', amount: '400.00' },
    }),
    makeRule({
      code: 'TARIFA_EPA', stage: 'BASE', priority: 10, stacking: 'EXCLUSIVE',
      scope: 'PARTY', partyId: 'P_A', expression: { op: 'FIXED', amount: '600.00' },
    }),
  ];

  it('entre una regla de compañía y una de país con la misma prioridad, debería ganar la de la compañía', () => {
    const result = run(rules, { partyId: 'P_A' });
    expect(result.trace.map((l) => l.ruleCode)).toContain('TARIFA_EPA');
  });
});
