// El total cuando el liquidador destildó líneas.
//
// Dos defectos que cierra:
//
// 1. Estaba calculado en DOS lugares del mismo modal: uno sumaba las líneas marcadas para el total,
//    otro acumulaba por separado los subtotales por etapa para mostrarlos. Dos recorridos sobre los
//    mismos datos que se desincronizan en cuanto uno cambie.
// 2. Usaba coma flotante (`reduce((s, l) => s + Number(l.final), 0)` y después `toFixed(2)`),
//    cuando todo el resto del módulo trabaja con decimales exactos justamente para no perder
//    centavos en este paso.

import { describe, expect, it } from 'vitest';
import { computeSettlementTotals, differsFromEngine } from '../settlementTotals';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, Country, TraceLine } from '../types';

const PAIS = makeCountryVE();

const linea = (seq: number, stage: TraceLine['stage'], final: string): TraceLine => ({
  seq,
  stage,
  ruleId: `R${seq}`,
  ruleCode: `R${seq}`,
  label: `Regla ${seq}`,
  inputs: {},
  computed: final,
  final,
  runningSubtotal: final,
});

// ── Sin destildar nada ────────────────────────────────────────────────────────────────────────

describe('con todas las líneas incluidas', () => {
  const trace = [linea(1, 'BASE', '400.00'), linea(2, 'VARIABLE', '80.00'), linea(3, 'SURCHARGE', '30.00')];

  it('el total es la suma', () => {
    expect(computeSettlementTotals(trace, [], PAIS).total).toBe('510.00');
  });

  it('los subtotales por etapa salen del MISMO recorrido que el total', () => {
    const totals = computeSettlementTotals(trace, [], PAIS);
    expect(totals.stageSubtotals.BASE).toBe('400.00');
    expect(totals.stageSubtotals.VARIABLE).toBe('80.00');
    expect(totals.stageSubtotals.SURCHARGE).toBe('30.00');
    expect(totals.stageSubtotals.TAX).toBe('0.00');
  });

  it('no hay nada excluido', () => {
    const totals = computeSettlementTotals(trace, [], PAIS);
    expect(totals.excludedCount).toBe(0);
    expect(totals.excludedAmount).toBe('0.00');
    expect(totals.includedCount).toBe(3);
  });
});

// ── Destildando ───────────────────────────────────────────────────────────────────────────────

describe('con líneas destildadas', () => {
  const trace = [linea(1, 'BASE', '400.00'), linea(2, 'VARIABLE', '80.00'), linea(3, 'SURCHARGE', '30.00')];

  it('el total baja y dice cuánto se quitó', () => {
    const totals = computeSettlementTotals(trace, [2, 3], PAIS);
    expect(totals.total).toBe('400.00');
    expect(totals.excludedAmount).toBe('110.00');
    expect(totals.excludedCount).toBe(2);
  });

  it('el subtotal de la etapa también baja', () => {
    // Era el punto de desincronización: el total se recalculaba y los subtotales se mostraban
    // acumulados por otra vía.
    const totals = computeSettlementTotals(trace, [2], PAIS);
    expect(totals.stageSubtotals.VARIABLE).toBe('0.00');
    expect(totals.stageSubtotals.BASE).toBe('400.00');
  });

  it('destildarlo todo da cero, no un total viejo', () => {
    expect(computeSettlementTotals(trace, [1, 2, 3], PAIS).total).toBe('0.00');
  });

  it('un seq que no existe se ignora', () => {
    expect(computeSettlementTotals(trace, [99], PAIS).total).toBe('510.00');
  });
});

// ── Aritmética exacta ─────────────────────────────────────────────────────────────────────────

describe('decimales', () => {
  it('no pierde centavos donde la coma flotante los perdía', () => {
    // 0.1 + 0.2 en coma flotante da 0.30000000000000004. El acumulador del módulo es exacto.
    const trace = [linea(1, 'BASE', '0.10'), linea(2, 'BASE', '0.20')];
    expect(computeSettlementTotals(trace, [], PAIS).total).toBe('0.30');
  });

  it('respeta el redondeo del país', () => {
    // Colombia liquida sin decimales: truncar o redondear cambia el importe que se paga.
    const colombia: Country = {
      id: 'CO', iso2: 'CO', name: 'Colombia', localCurrency: 'COP',
      roundingDecimals: 0, roundingMode: 'HALF_EVEN', overnightThresholdHours: 20,
    };
    const trace = [linea(1, 'BASE', '100.5'), linea(2, 'BASE', '100.5')];
    expect(computeSettlementTotals(trace, [], colombia).total).toBe('201');
  });

  it('un descuento resta', () => {
    const trace = [linea(1, 'BASE', '400.00'), linea(2, 'ADJUSTMENT', '-40.00')];
    expect(computeSettlementTotals(trace, [], PAIS).total).toBe('360.00');
  });
});

// ── Contra el motor ───────────────────────────────────────────────────────────────────────────

describe('differsFromEngine', () => {
  function resultado() {
    const { zoneGroups, zones, locations } = makeGeoVE();
    const input: CalculateInput = {
      country: PAIS,
      trip: makeTrip(),
      rules: [
        makeRule({ code: 'BASE', stage: 'BASE', expression: { op: 'FIXED', amount: '400.00' } }),
        makeRule({ code: 'EXTRA', stage: 'SURCHARGE', expression: { op: 'FIXED', amount: '30.00' } }),
      ],
      zones, zoneGroups, locations,
      ownCostParams: makeOwnCostParams(),
      outsourcedCostRates: [],
      marginPolicy: makeMarginPolicy(),
    };
    return calculate(input);
  }

  it('sin destildar, coincide con el motor exactamente', () => {
    const result = resultado();
    const totals = computeSettlementTotals(result.trace, [], PAIS);

    expect(totals.total).toBe(result.totalLiquidado);
    expect(differsFromEngine(totals, result)).toBe(false);
  });

  it('al destildar, avisa que el total ya no es el del motor', () => {
    // Un total que no coincide con el del cálculo tiene que verse: es una decisión de una persona.
    const result = resultado();
    const totals = computeSettlementTotals(result.trace, [result.trace[1]!.seq], PAIS);

    expect(differsFromEngine(totals, result)).toBe(true);
    expect(Number(result.totalLiquidado) - Number(totals.total)).toBe(30);
  });
});
