// Vigencia por regla.
//
// El agujero que cierra: hasta acá, editar una regla cambiaba el resultado de CUALQUIER
// liquidación, incluidas las de viajes ya hechos. Si un transportista subía su tarifa en
// septiembre, recalcular un viaje de agosto daba el precio de septiembre — y no había forma de
// demostrar cuánto correspondía cobrar ese día.
//
// El criterio es la fecha del VIAJE (`trip.quotedAt`), no la fecha de hoy, y es lo que hace que la
// proforma se pueda volver a derivar en vez de solo quedar congelada.

import { describe, expect, it } from 'vitest';
import { deriveContext, isRuleInEffect, resolveRules } from '../resolver';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import type { CalculateInput, Rule, TripContext } from '../types';

// ── La unidad pura ────────────────────────────────────────────────────────────────────────────

describe('isRuleInEffect', () => {
  const conPeriodo = { effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' };

  it('una regla sin fechas rige siempre — el estado de todas las reglas anteriores', () => {
    expect(isRuleInEffect({}, '2020-01-01T00:00:00.000Z')).toBe(true);
    expect(isRuleInEffect({ effectiveFrom: null, effectiveTo: null }, '2099-12-31T00:00:00.000Z')).toBe(true);
  });

  it('adentro del período rige', () => {
    expect(isRuleInEffect(conPeriodo, '2026-08-15T10:00:00.000Z')).toBe(true);
  });

  it('AMBOS extremos están incluidos', () => {
    // "Vence el 31 de agosto" cubre todo el 31. Comparar el timestamp completo contra la fecha
    // pelada dejaría afuera cualquier viaje después de medianoche de ese día.
    expect(isRuleInEffect(conPeriodo, '2026-08-01T00:00:00.000Z')).toBe(true);
    expect(isRuleInEffect(conPeriodo, '2026-08-31T23:59:59.000Z')).toBe(true);
  });

  it('un día antes o un día después queda afuera', () => {
    expect(isRuleInEffect(conPeriodo, '2026-07-31T23:59:59.000Z')).toBe(false);
    expect(isRuleInEffect(conPeriodo, '2026-09-01T00:00:00.000Z')).toBe(false);
  });

  it('un solo extremo abre el período del otro lado', () => {
    expect(isRuleInEffect({ effectiveFrom: '2026-08-01' }, '2030-01-01T00:00:00.000Z')).toBe(true);
    expect(isRuleInEffect({ effectiveFrom: '2026-08-01' }, '2026-07-31T00:00:00.000Z')).toBe(false);
    expect(isRuleInEffect({ effectiveTo: '2026-08-31' }, '2000-01-01T00:00:00.000Z')).toBe(true);
    expect(isRuleInEffect({ effectiveTo: '2026-08-31' }, '2026-09-01T00:00:00.000Z')).toBe(false);
  });

  it('acepta una fecha de viaje sin hora', () => {
    expect(isRuleInEffect(conPeriodo, '2026-08-15')).toBe(true);
  });
});

// ── El caso de negocio: la tarifa cambia de mes ───────────────────────────────────────────────

function totalEn(fecha: string, rules: Rule[], trip: Partial<TripContext> = {}): string {
  const { zoneGroups, zones, locations } = makeGeoVE();
  const input: CalculateInput = {
    country: makeCountryVE(),
    trip: makeTrip({ quotedAt: fecha, ...trip }),
    rules,
    zones,
    zoneGroups,
    locations,
    ownCostParams: makeOwnCostParams(),
    outsourcedCostRates: [],
    marginPolicy: makeMarginPolicy(),
  };
  return calculate(input).totalLiquidado;
}

describe('el transportista sube su tarifa el 1 de septiembre', () => {
  // La forma correcta de registrar el aumento: vencer la vieja y abrir la nueva, en vez de editar
  // la vieja en el lugar (que es lo que reescribía el pasado).
  const agosto = makeRule({
    code: 'TARIFA_BASE',
    stage: 'BASE',
    expression: { op: 'FIXED', amount: '400.00' },
    effectiveTo: '2026-08-31',
  });
  const septiembre = makeRule({
    code: 'TARIFA_BASE_NUEVA',
    stage: 'BASE',
    expression: { op: 'FIXED', amount: '480.00' },
    effectiveFrom: '2026-09-01',
  });
  const ambas = [agosto, septiembre];

  it('un viaje de agosto se liquida con la tarifa de agosto', () => {
    expect(totalEn('2026-08-15T10:00:00.000Z', ambas)).toBe('400.00');
  });

  it('el último día de agosto todavía es tarifa vieja', () => {
    expect(totalEn('2026-08-31T18:40:00.000Z', ambas)).toBe('400.00');
  });

  it('un viaje de septiembre se liquida con la nueva', () => {
    expect(totalEn('2026-09-01T00:30:00.000Z', ambas)).toBe('480.00');
  });

  it('recalcular el viaje de agosto en octubre sigue dando el número de agosto', () => {
    // Éste es el punto entero: el resultado no depende de cuándo se corre el cálculo.
    expect(totalEn('2026-08-15T10:00:00.000Z', ambas)).toBe('400.00');
  });

  it('sin vigencia, las dos tarifas se habrían sumado', () => {
    // El comportamiento anterior, para dejar clara la diferencia: ambas reglas BASE conviven y el
    // viaje de agosto pagaba 880.
    const sinVigencia = [
      makeRule({ code: 'A', stage: 'BASE', expression: { op: 'FIXED', amount: '400.00' } }),
      makeRule({ code: 'B', stage: 'BASE', expression: { op: 'FIXED', amount: '480.00' } }),
    ];
    expect(totalEn('2026-08-15T10:00:00.000Z', sinVigencia)).toBe('880.00');
  });
});

// ── Traza ─────────────────────────────────────────────────────────────────────────────────────

describe('la regla fuera de vigencia queda explicada, no desaparecida', () => {
  const geo = makeGeoVE();
  const base = {
    country: makeCountryVE(),
    zones: geo.zones,
    zoneGroups: geo.zoneGroups,
    locations: geo.locations,
  };

  function descartadas(rule: Rule, fecha: string) {
    const trip = makeTrip({ quotedAt: fecha });
    const derived = deriveContext({ ...base, trip });
    return resolveRules({ ...base, trip, rules: [rule] }, derived).discarded;
  }

  it('dice que el viaje es anterior a la fecha de inicio', () => {
    const rule = makeRule({
      code: 'FUTURA', stage: 'BASE', expression: { op: 'FIXED', amount: '1.00' },
      effectiveFrom: '2026-09-01',
    });
    const [descarte] = descartadas(rule, '2026-08-15T10:00:00.000Z');

    expect(descarte?.reason).toBe('OUT_OF_PERIOD');
    expect(descarte?.detail).toContain('2026-09-01');
    expect(descarte?.detail).toContain('2026-08-15');
  });

  it('dice hasta cuándo rigió cuando ya venció', () => {
    const rule = makeRule({
      code: 'VENCIDA', stage: 'BASE', expression: { op: 'FIXED', amount: '1.00' },
      effectiveTo: '2026-06-30',
    });
    const [descarte] = descartadas(rule, '2026-08-15T10:00:00.000Z');

    expect(descarte?.reason).toBe('OUT_OF_PERIOD');
    expect(descarte?.detail).toContain('2026-06-30');
  });

  it('una regla inactiva se descarta por inactiva, no por vigencia', () => {
    // El orden importa para el mensaje: desactivarla es una decisión, vencerla es el calendario.
    const rule = makeRule({
      code: 'APAGADA', stage: 'BASE', expression: { op: 'FIXED', amount: '1.00' },
      active: false, effectiveTo: '2026-06-30',
    });
    expect(descartadas(rule, '2026-08-15T10:00:00.000Z')[0]?.reason).toBe('INACTIVE');
  });
});

// ── Convivencia con el resto del modelo ───────────────────────────────────────────────────────

describe('la vigencia no se pisa con el alcance ni con el stacking', () => {
  it('una regla de compañía vencida no tapa la de país', () => {
    // Sin esto, vencer la regla propia de una compañía la dejaba sin NINGUNA tarifa: la de país
    // seguía descartada como "sobrescrita" por una regla que ya no aplica.
    const pais = makeRule({
      code: 'TARIFA', stage: 'BASE', expression: { op: 'FIXED', amount: '400.00' },
    });
    const compania = makeRule({
      code: 'TARIFA', stage: 'BASE', expression: { op: 'FIXED', amount: '999.00' },
      scope: 'PARTY', partyId: 'P1', effectiveTo: '2026-06-30',
    });

    expect(totalEn('2026-08-15T10:00:00.000Z', [pais, compania], { partyId: 'P1' })).toBe('400.00');
  });

  it('una EXCLUSIVE vencida deja competir a la siguiente', () => {
    const vencida = makeRule({
      code: 'A', stage: 'BASE', stacking: 'EXCLUSIVE', priority: 1,
      expression: { op: 'FIXED', amount: '999.00' }, effectiveTo: '2026-06-30',
    });
    const vigente = makeRule({
      code: 'B', stage: 'BASE', stacking: 'EXCLUSIVE', priority: 5,
      expression: { op: 'FIXED', amount: '400.00' },
    });

    expect(totalEn('2026-08-15T10:00:00.000Z', [vencida, vigente])).toBe('400.00');
  });
});
