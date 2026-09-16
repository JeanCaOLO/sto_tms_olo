// @vitest-environment jsdom
//
// Absorción de las tarifas zona-a-zona dentro de los tarifarios.
//
// Eran una tabla de tarifas con la clave FIJA en dos columnas, o sea un caso particular de lo que
// el tarifario hace con N. Mantener las dos significaba dos pantallas para cargar lo mismo y dos
// lugares donde buscar por qué un viaje cobró lo que cobró.
//
// Lo que estas pruebas cuidan es que la absorción NO cambie ningún número: un viaje que cobraba 500
// por el tramo Carabobo → Zulia tiene que seguir cobrando 500 después de migrar.

import { beforeEach, describe, expect, it } from 'vitest';
import { absorbZoneLaneRates, loadDatabase, type TarifasDatabase } from '../localData/store';
import { calculate } from '../index';
import { makeCountryVE, makeGeoVE, makeMarginPolicy, makeOwnCostParams, makeRule, makeTrip } from './fixtures';
import { RATE_TABLE_WILDCARD, type CalculateInput, type RateTable, type RateTableRow } from '../types';

const baseDb = (overrides: Record<string, unknown> = {}) => ({
  countries: [],
  zoneGroups: [],
  zones: [
    { id: 'Z_VE_CAR', country_id: 'VE', zone_group_id: null, code: 'CAR', name: 'Carabobo', status: 'active' },
    { id: 'Z_VE_ZUL', country_id: 'VE', zone_group_id: null, code: 'ZUL', name: 'Zulia', status: 'active' },
  ],
  // Clave HEREDADA: así estaba guardado antes de que los tarifarios absorbieran los tramos.
  zoneLaneRates: [
    { id: 'ZLR_1', country_id: 'VE', origin_zone_id: 'Z_VE_CAR', dest_zone_id: 'Z_VE_ZUL', amount: '500.00', currency: 'USD', status: 'active' },
  ],
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

beforeEach(() => { localStorage.clear(); });

// ── La conversión ─────────────────────────────────────────────────────────────────────────────

describe('absorbZoneLaneRates', () => {
  it('crea un tarifario por país con la clave zona origen / zona destino', () => {
    const result = absorbZoneLaneRates(baseDb());

    expect(result.rateTables).toHaveLength(1);
    expect(result.rateTables[0]).toMatchObject({
      id: 'RT_ZONAS_VE',
      country_id: 'VE',
      code: 'ZONAS',
      key_columns: ['originZone', 'destZone'],
      party_id: null,
      active: true,
    });
  });

  it('traduce el id de la zona a su CÓDIGO, que es lo que compara el motor', () => {
    // Guardar el id dejaría un tarifario que no casa nunca: `vars.originZone` trae el código.
    const result = absorbZoneLaneRates(baseDb());

    expect(result.rateTableRows).toHaveLength(1);
    expect(result.rateTableRows[0]).toMatchObject({
      table_id: 'RT_ZONAS_VE',
      key: ['CAR', 'ZUL'],
      amount: '500.00',
      active: true,
    });
  });

  it('un tramo cuya zona ya no existe conserva el id crudo en vez de desaparecer', () => {
    const db = baseDb({
      zoneLaneRates: [
        { id: 'ZLR_X', country_id: 'VE', origin_zone_id: 'Z_BORRADA', dest_zone_id: 'Z_VE_ZUL', amount: '100', status: 'active' },
      ],
    });
    // Se ve roto en pantalla, que es lo que hace falta para poder arreglarlo.
    expect(absorbZoneLaneRates(db).rateTableRows[0]?.key).toEqual(['Z_BORRADA', 'ZUL']);
  });

  it('la clave heredada desaparece: los tramos son la misma cosa, no una copia', () => {
    const result = absorbZoneLaneRates(baseDb()) as unknown as Record<string, unknown>;
    expect(result.zoneLaneRates).toBeUndefined();
  });

  it('un país por tarifario', () => {
    const db = baseDb({
      zones: [
        ...baseDb().zones,
        { id: 'Z_CR_SJO', country_id: 'CR', zone_group_id: null, code: 'SJO', name: 'San José', status: 'active' },
        { id: 'Z_CR_LIM', country_id: 'CR', zone_group_id: null, code: 'LIM', name: 'Limón', status: 'active' },
      ],
      zoneLaneRates: [
        { id: 'ZLR_1', country_id: 'VE', origin_zone_id: 'Z_VE_CAR', dest_zone_id: 'Z_VE_ZUL', amount: '500.00', status: 'active' },
        { id: 'ZLR_CR', country_id: 'CR', origin_zone_id: 'Z_CR_SJO', dest_zone_id: 'Z_CR_LIM', amount: '900', status: 'active' },
      ],
    });
    const result = absorbZoneLaneRates(db);

    expect(result.rateTables.map((t) => t.id).sort()).toEqual(['RT_ZONAS_CR', 'RT_ZONAS_VE']);
  });

  it('es idempotente: sin tramos que absorber no hace nada', () => {
    const migrada = absorbZoneLaneRates(baseDb());
    const otraVez = absorbZoneLaneRates(migrada);

    expect(otraVez).toBe(migrada);
    expect(otraVez.rateTables).toHaveLength(1);
  });

  it('no duplica el tarifario si ya lo creó una pasada anterior', () => {
    // Pasa de verdad: la semilla se migra al clonarse y se vuelve a migrar al fusionarse con lo
    // guardado. Dos filas con el mismo id romperían la capa de datos.
    const yaMigrada = absorbZoneLaneRates(baseDb());
    const conTramosOtraVez = { ...yaMigrada, zoneLaneRates: (baseDb() as unknown as Record<string, unknown[]>).zoneLaneRates };

    const result = absorbZoneLaneRates(conTramosOtraVez);

    expect(result.rateTables).toHaveLength(1);
    expect(result.rateTableRows).toHaveLength(1);
  });

  it('no toca la base original', () => {
    const db = baseDb();
    absorbZoneLaneRates(db);
    expect((db as unknown as Record<string, unknown[]>).zoneLaneRates).toHaveLength(1);
    expect(db.rateTables).toHaveLength(0);
  });
});

// ── Las reglas viejas ─────────────────────────────────────────────────────────────────────────

describe('reescritura de las reglas que usaban LOOKUP_ZONE', () => {
  it('apunta la regla al tarifario nuevo y conserva su respaldo', () => {
    const db = baseDb({
      pricingRules: [{
        id: 'R1', country_id: 'VE', code: 'R_ZONE', stage: 'BASE',
        expression: { op: 'LOOKUP_ZONE', fallback: { op: 'PER_KM', rate: '1.20' } },
      }],
    });

    const result = absorbZoneLaneRates(db);

    expect(result.pricingRules[0]?.expression).toEqual({
      op: 'LOOKUP_TABLE',
      table: 'ZONAS',
      fallback: { op: 'PER_KM', rate: '1.20' },
    });
  });

  it('también reescribe un LOOKUP_ZONE anidado', () => {
    // Sin recorrer la expresión entera, una regla con el lookup adentro de un MAX quedaría
    // apuntando a datos que ya no existen y cobraría su respaldo sin que nadie se entere.
    const db = baseDb({
      pricingRules: [{
        id: 'R1', country_id: 'VE', code: 'R_MAX', stage: 'BASE',
        expression: {
          op: 'MAX',
          args: [
            { op: 'FIXED', amount: '100' },
            { op: 'LOOKUP_ZONE', fallback: { op: 'FIXED', amount: '0' } },
          ],
        },
      }],
    });

    const expression = absorbZoneLaneRates(db).pricingRules[0]?.expression;
    expect(expression.args[1]).toEqual({
      op: 'LOOKUP_TABLE', table: 'ZONAS', fallback: { op: 'FIXED', amount: '0' },
    });
    // Lo que no era un lookup se deja igual.
    expect(expression.args[0]).toEqual({ op: 'FIXED', amount: '100' });
  });

  it('una regla de un país sin tramos no se toca', () => {
    const db = baseDb({
      pricingRules: [{
        id: 'R1', country_id: 'CO', code: 'R_ZONE', stage: 'BASE',
        expression: { op: 'LOOKUP_ZONE', fallback: { op: 'FIXED', amount: '5' } },
      }],
    });
    expect(absorbZoneLaneRates(db).pricingRules[0]?.expression.op).toBe('LOOKUP_ZONE');
  });

  it('una regla sin lookup conserva su objeto, sin copias inútiles', () => {
    const expression = { op: 'FIXED', amount: '10' };
    const db = baseDb({
      pricingRules: [{ id: 'R1', country_id: 'VE', code: 'R', stage: 'BASE', expression }],
    });
    expect(absorbZoneLaneRates(db).pricingRules[0]?.expression).toBe(expression);
  });
});

// Nota: la comparación "el mismo viaje cobra lo mismo antes y después" vivía acá y se eliminó al
// quitar `LOOKUP_ZONE` del motor: ya no hay "antes" contra el que comparar. La garantía que dejó es
// que el importe de cada tramo llega intacto al tarifario, que es lo que verifican los casos de
// arriba, y que el tarifario cobra lo que dice, que verifica `rateTableBuilder.test.ts`.

// ── Sobre la semilla real ─────────────────────────────────────────────────────────────────────

describe('la semilla llega ya absorbida', () => {
  it('la semilla ya no tiene tarifas por zona sueltas, y sí el tarifario', () => {
    const db = loadDatabase();

    // La colección desapareció del módulo: el tarifario ZONAS viene horneado en la semilla.
    expect((db as unknown as Record<string, unknown>).zoneLaneRates).toBeUndefined();
    expect(db.rateTables.length).toBeGreaterThan(0);
    expect(db.rateTableRows.length).toBeGreaterThan(0);
  });

  it('las reglas de la semilla ya apuntan al tarifario', () => {
    const db = loadDatabase();
    const zonales = db.pricingRules.filter((r) => r.code === 'R_ZONE_FALLBACK');

    expect(zonales.length).toBeGreaterThan(0);
    for (const rule of zonales) {
      expect(rule.expression.op).toBe('LOOKUP_TABLE');
      expect(rule.expression.table).toBe('ZONAS');
    }
  });

  it('cada fila migrada usa códigos de zona, no ids', () => {
    const db = loadDatabase();
    const codigos = new Set(db.zones.map((z) => z.code));

    // El comodín "*" no es un código de zona: es un valor legítimo del tarifario (§2.7 del
    // ROADMAP), no un id que se coló de la migración — que es lo único que este test cuida.
    for (const row of db.rateTableRows) {
      for (const value of row.key) {
        expect(value === RATE_TABLE_WILDCARD || codigos.has(value)).toBe(true);
      }
    }
  });
});
