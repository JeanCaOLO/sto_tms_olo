// @vitest-environment jsdom
//
// Paso de dos monedas por país a una sola.
//
// Por qué hace falta una migración y no alcanza con cambiar la semilla: la semilla sólo se usa
// cuando no hay nada guardado. Quien ya tenía datos en el navegador conserva importes escritos en
// la moneda de REFERENCIA (dólares) y un país que liquidaba en otra. Sin convertirlos, esos
// importes se releerían como si fueran pesos o colones — un costo 4.000 veces más chico, con un
// margen del 100% y ningún error a la vista.

import { describe, expect, it } from 'vitest';
import { migrateToSingleCurrency, type TarifasDatabase } from '../localData/store';
import { detectCurrency } from '../costSheetParser';
import { formatMoney } from '../format';
import seed from '../localData/seed.json';

/** Base con la forma ANTERIOR: dos monedas por país y una tasa de cambio. */
const baseVieja = (overrides: Record<string, unknown> = {}): TarifasDatabase => ({
  countries: [
    { id: 'CO', iso2: 'CO', name: 'Colombia', local_currency: 'COP', ref_currency: 'USD', rounding_decimals: 0, rounding_mode: 'HALF_EVEN', overnight_threshold_hours: 20 },
    { id: 'VE', iso2: 'VE', name: 'Venezuela', local_currency: 'USD', ref_currency: 'USD', rounding_decimals: 2, rounding_mode: 'HALF_UP', overnight_threshold_hours: 24 },
  ],
  fxRates: [
    { id: 'FX_CO', country_id: 'CO', from_currency: 'COP', to_currency: 'USD', rate: '4000', rate_type: 'OFFICIAL', source: 'test', valid_from: '2020-01-01T00:00:00.000Z' },
  ],
  zoneGroups: [],
  zones: [],
  zoneMappings: [],
  pricingRules: [],
  pricingTemplates: [],
  settlementParties: [],
  partyVariables: [],
  partyVehicleTypes: [],
  costStructures: [],
  costStructureRows: [],
  rateTables: [],
  rateTableRows: [],
  ownCostParams: [],
  outsourcedCostRates: [],
  marginPolicies: [],
  auditLog: [],
  settlementSnapshots: [],
  ...overrides,
} as unknown as TarifasDatabase);

const regla = (extra: Record<string, unknown>) => ({
  id: 'R', country_id: 'CO', code: 'R1', stage: 'BASE', priority: 10, stacking: 'SUM',
  conditions: { p: 'ALWAYS' }, active: true, version: 1, ...extra,
});

// ── El país ───────────────────────────────────────────────────────────────────────────────────

describe('la moneda del país', () => {
  it('queda la de referencia, que es la que va a usar el motor', () => {
    const result = migrateToSingleCurrency(baseVieja());
    const co = result.countries.find((c) => c.id === 'CO');

    expect(co?.local_currency).toBe('USD');
    expect(co).not.toHaveProperty('ref_currency');
  });

  it('las tasas de cambio desaparecen', () => {
    const result = migrateToSingleCurrency(baseVieja()) as unknown as Record<string, unknown>;
    expect(result.fxRates).toBeUndefined();
  });
});

// ── Los importes ──────────────────────────────────────────────────────────────────────────────

describe('reexpresión de importes', () => {
  it('un importe en moneda de referencia se multiplica por la tasa', () => {
    // 350 dólares a 4.000 son 1.400.000 pesos. Sin esto, se leerían como 350 pesos.
    const db = baseVieja({
      pricingRules: [regla({ currency_mode: 'REF', expression: { op: 'FIXED', amount: '350' } })],
    });
    expect(migrateToSingleCurrency(db).pricingRules[0]?.expression.amount).toBe('1400000');
  });

  it('un importe ya escrito en moneda local no se toca', () => {
    const db = baseVieja({
      pricingRules: [regla({ currency_mode: 'LOCAL', expression: { op: 'FIXED', amount: '350' } })],
    });
    expect(migrateToSingleCurrency(db).pricingRules[0]?.expression.amount).toBe('350');
  });

  it('sin modo declarado se trata como referencia, que es como lo leía el motor', () => {
    const db = baseVieja({
      pricingRules: [regla({ expression: { op: 'FIXED', amount: '350' } })],
    });
    expect(migrateToSingleCurrency(db).pricingRules[0]?.expression.amount).toBe('1400000');
  });

  it('un país que ya liquidaba en su moneda de referencia no cambia de escala', () => {
    // Venezuela liquidaba en dólares y su referencia también era el dólar: convertir sería duplicar.
    const db = baseVieja({
      pricingRules: [regla({ country_id: 'VE', currency_mode: 'REF', expression: { op: 'FIXED', amount: '400' } })],
    });
    expect(migrateToSingleCurrency(db).pricingRules[0]?.expression.amount).toBe('400');
  });

  it('el modo se borra de la fila', () => {
    const db = baseVieja({
      pricingRules: [regla({ currency_mode: 'REF', expression: { op: 'FIXED', amount: '1' } })],
    });
    expect(migrateToSingleCurrency(db).pricingRules[0]).not.toHaveProperty('currency_mode');
  });
});

// ── Lo que NO se escala ───────────────────────────────────────────────────────────────────────

describe('lo que no es dinero se deja quieto', () => {
  it('un porcentaje es una fracción, no un importe', () => {
    // Escalar un 4% por 4.000 daría un 16.000% — y el descuento se comería la liquidación entera.
    const db = baseVieja({
      pricingRules: [regla({
        currency_mode: 'REF',
        expression: { op: 'PERCENT', pct: '-0.04', base: { of: 'RUNNING_SUBTOTAL' } },
      })],
    });
    expect(migrateToSingleCurrency(db).pricingRules[0]?.expression.pct).toBe('-0.04');
  });

  it('la regla de peajes traslada el monto del viaje: su tarifa es un multiplicador', () => {
    // `tollsAmount` ya viene en la moneda del viaje. Escalar el multiplicador cobraría los peajes
    // multiplicados por la tasa.
    const db = baseVieja({
      pricingRules: [regla({
        code: 'R_TOLLS', currency_mode: 'LOCAL',
        expression: { op: 'PER_UNIT', unit: 'tollsAmount', rate: '1' },
      })],
    });
    expect(migrateToSingleCurrency(db).pricingRules[0]?.expression.rate).toBe('1');
  });
});

// ── Expresiones compuestas ────────────────────────────────────────────────────────────────────

describe('expresiones anidadas', () => {
  it('escala los tramos de un escalonado', () => {
    const db = baseVieja({
      pricingRules: [regla({
        currency_mode: 'REF',
        expression: { op: 'TIERED', unit: 'km', mode: 'RATE', tiers: [{ upTo: 100, amount: '2' }, { upTo: null, amount: '1.5' }] },
      })],
    });
    const tiers = migrateToSingleCurrency(db).pricingRules[0]?.expression.tiers;
    expect(tiers.map((t: any) => t.amount)).toEqual(['8000', '6000']);
  });

  it('escala el respaldo de una búsqueda en tarifario', () => {
    const db = baseVieja({
      pricingRules: [regla({
        currency_mode: 'REF',
        expression: { op: 'LOOKUP_TABLE', table: 'ZONAS', fallback: { op: 'PER_KM', rate: '1' } },
      })],
    });
    expect(migrateToSingleCurrency(db).pricingRules[0]?.expression.fallback.rate).toBe('4000');
  });

  it('llega hasta adentro de un MAX', () => {
    const db = baseVieja({
      pricingRules: [regla({
        currency_mode: 'REF',
        expression: { op: 'MAX', args: [{ op: 'FIXED', amount: '10' }, { op: 'FIXED', amount: '20' }] },
      })],
    });
    const args = migrateToSingleCurrency(db).pricingRules[0]?.expression.args;
    expect(args.map((a: any) => a.amount)).toEqual(['40000', '80000']);
  });
});

// ── Costos ────────────────────────────────────────────────────────────────────────────────────

describe('los costos se reexpresan con el mismo criterio', () => {
  it('los tres campos del costo propio', () => {
    // Si se convirtiera el cargo y no el costo, el margen daría casi 100% en todos los viajes.
    const db = baseVieja({
      ownCostParams: [{ id: 'OWN', country_id: 'CO', cost_per_km: '0.95', depreciation_per_km: '0.15', driver_daily: '28', currency_mode: 'REF' }],
    });
    const own = migrateToSingleCurrency(db).ownCostParams[0];
    expect([own?.cost_per_km, own?.depreciation_per_km, own?.driver_daily]).toEqual(['3800', '600', '112000']);
  });

  it('la tarifa plana de un tercero', () => {
    const db = baseVieja({
      outsourcedCostRates: [{ id: 'OSR', country_id: 'CO', carrier_id: 'C1', truck_type_id: 'TT', flat_rate: '300', currency_mode: 'REF' }],
    });
    expect(migrateToSingleCurrency(db).outsourcedCostRates[0]?.flat_rate).toBe('1200000');
  });
});

// ── Idempotencia ──────────────────────────────────────────────────────────────────────────────

describe('correr dos veces no duplica la conversión', () => {
  it('sin tasas guardadas devuelve la misma base', () => {
    const yaMigrada = migrateToSingleCurrency(baseVieja({
      pricingRules: [regla({ currency_mode: 'REF', expression: { op: 'FIXED', amount: '350' } })],
    }));

    const otraVez = migrateToSingleCurrency(yaMigrada);

    expect(otraVez).toBe(yaMigrada);
    expect(otraVez.pricingRules[0]?.expression.amount).toBe('1400000');
  });

  it('no toca la base original', () => {
    const db = baseVieja({
      pricingRules: [regla({ currency_mode: 'REF', expression: { op: 'FIXED', amount: '350' } })],
    });
    migrateToSingleCurrency(db);
    expect(db.pricingRules[0]?.expression.amount).toBe('350');
    expect(db.countries[0]?.local_currency).toBe('COP');
  });
});

// ── VES queda retirado del módulo, no sólo de los datos ─────────────────────────────────────────
//
// La migración de arriba deja a Venezuela liquidando en dólares, pero eso solo prueba el dato de
// HOY. Lo que sigue prueba que el CÓDIGO ya no puede volver a producir un importe en VES, ni desde
// la semilla ni desde una hoja de costos que alguien suba con "Bs." en el encabezado.

describe('VES retirado', () => {
  it('la semilla no menciona VES en ningún lado', () => {
    expect(JSON.stringify(seed)).not.toContain('VES');
  });

  it('un encabezado en bolívares ya no se detecta como moneda', () => {
    // Antes esto devolvía 'VES'. Ahora no hay ningún país que liquide en bolívares: que se detecte
    // otra vez sería la señal de que alguien reintrodujo el patrón.
    expect(detectCurrency(['Costos del Conductor', 'Monto en Bs.'])).not.toBe('VES');
    expect(detectCurrency(['Tarifa en bolívares'])).not.toBe('VES');
  });

  it('formatear un importe en VES ya no tiene símbolo propio', () => {
    // Sin entrada en el mapa, cae al formato genérico "importe MONEDA" en vez de imprimir "Bs.".
    expect(formatMoney('100', 'VES')).toBe('100 VES');
  });
});
