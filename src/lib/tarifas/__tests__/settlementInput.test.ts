// @vitest-environment jsdom
//
// El armado de la entrada del motor, partido en dos: cargar (impuro, por `db()`) y combinar (puro).
//
// Por qué importa: si el Probador y la liquidación arman la entrada por caminos distintos, divergen.
// Ya pasó con las zonas (la regla funcionaba en la prueba y nunca en producción) y casi vuelve a
// pasar con los tarifarios. Con un solo cargador y un solo armado, no pueden divergir.

import { beforeEach, describe, expect, it } from 'vitest';
import { CatalogError, loadCountries, loadTarifasCatalog, loadZones, type TarifasCatalog } from '../catalogLoader';
import { buildCalculateInput, locationsFromZones } from '../settlementInput';
import { calculate } from '../index';
import { db } from '../data';
import { makeTrip } from './fixtures';
import type { TripContext } from '../types';

/** Viaje del país de la semilla, con las zonas reales de Venezuela. */
const viajeVE = (overrides: Partial<TripContext> = {}): TripContext => ({
  ...makeTrip(),
  countryId: 'VE',
  originLocationId: 'Z_VE_CCS',
  destLocationId: 'Z_VE_CAR',
  ...overrides,
});

beforeEach(() => { localStorage.clear(); });

// ── El cargador ───────────────────────────────────────────────────────────────────────────────

describe('loadTarifasCatalog', () => {
  it('trae todo lo que el motor necesita de un país', async () => {
    const catalog = await loadTarifasCatalog('VE', null);

    expect(catalog.country.id).toBe('VE');
    expect(catalog.country.localCurrency).toBe('USD');
    expect(catalog.country.roundingDecimals).toBe(2);
    expect(catalog.rules.length).toBeGreaterThan(0);
    expect(catalog.zones.length).toBeGreaterThan(0);
    expect(catalog.defaultCostStructure).toBeTruthy();
    expect(catalog.marginPolicy).toBeTruthy();
  });

  it('falla con un mensaje que dice dónde configurarlo, en vez de devolver un catálogo a medias', async () => {
    // Un catálogo incompleto produciría un total plausible calculado sobre huecos.
    await expect(loadTarifasCatalog('XX', null)).rejects.toThrow(CatalogError);
    await expect(loadTarifasCatalog('XX', null)).rejects.toThrow(/configuración de cálculo/);
  });

  it('un país del catálogo sin configuración de cálculo no es liquidable', async () => {
    // El país existe en el TMS, pero sin redondeo ni umbral de pernocta no hay cálculo posible.
    const [settings] = await db().find('countrySettings', { where: [{ column: 'country_id', op: 'eq', value: 'CO' }] });
    await db().delete('countrySettings', settings.id);

    await expect(loadTarifasCatalog('CO', null)).rejects.toThrow(CatalogError);
    expect((await loadCountries()).map((c) => c.id)).not.toContain('CO');
  });

  it('sin perfil no trae variables ni estructura de costos de nadie', async () => {
    const catalog = await loadTarifasCatalog('VE', null);
    expect(catalog.partyVariables).toEqual([]);
    expect(catalog.costStructure).toBeNull();
  });

  it('con perfil trae SÓLO lo suyo', async () => {
    // Mezclar las variables de otro haría que una regla resolviera con un número que no le
    // corresponde, o que mirara el tarifario de un tercero.
    await db().insert('partyVariable', {
      party_id: 'CARRIER_VE_1', key: 'custom:espera', label: 'Espera',
      kind: 'NUMBER', origin: 'PER_TRIP', default_value: '0', unit: 'h', active: true,
    });
    await db().insert('partyVariable', {
      party_id: 'CARRIER_VE_2', key: 'custom:ajena', label: 'Ajena',
      kind: 'NUMBER', origin: 'CONSTANT', default_value: '99', unit: null, active: true,
    });

    const catalog = await loadTarifasCatalog('VE', 'CARRIER_VE_1');
    expect(catalog.partyVariables.map((v) => v.key)).toContain('custom:espera');
    expect(catalog.partyVariables.map((v) => v.key)).not.toContain('custom:ajena');
  });

  it('los tarifarios son los del país más los del perfil, nunca los de un tercero', async () => {
    await db().insert('rateTable', {
      country_id: 'VE', party_id: 'CARRIER_VE_2', code: 'AJENO', name: 'De otro',
      key_columns: ['originZone'], active: true,
    });

    const catalog = await loadTarifasCatalog('VE', 'CARRIER_VE_1');
    expect(catalog.rateTables.map((t) => t.code)).not.toContain('AJENO');
  });

  it('un tarifario del perfil reemplaza al del país con el mismo código', async () => {
    await db().insert('rateTable', {
      country_id: 'VE', party_id: 'CARRIER_VE_1', code: 'ZONAS', name: 'Tarifario propio',
      key_columns: ['originZone', 'destZone'], active: true,
    });

    const catalog = await loadTarifasCatalog('VE', 'CARRIER_VE_1');
    const zonas = catalog.rateTables.filter((t) => t.code === 'ZONAS');
    expect(zonas).toHaveLength(1);
    expect(zonas[0]?.partyId).toBe('CARRIER_VE_1');
  });
});

describe('zonas del catálogo y grupos del cálculo', () => {
  it('el grupo de cada zona sale de los códigos que declara el grupo', async () => {
    const zonas = await loadZones('VE');
    const ccs = zonas.find((z) => z.code === 'CCS');
    expect(ccs?.zoneGroupId).toBe('ZG_VE_CENTRO');
  });

  it('una zona que ningún grupo nombra queda sin grupo, y el cálculo no se rompe', async () => {
    const [grupo] = await db().find('zoneGroup', { where: [{ column: 'id', op: 'eq', value: 'ZG_VE_CENTRO' }] });
    await db().update('zoneGroup', grupo.id, { zone_codes: [] });

    const catalog = await loadTarifasCatalog('VE', null);
    expect(catalog.zones.find((z) => z.code === 'CCS')?.zoneGroupId).toBeNull();
    expect(() => calculate(buildCalculateInput(catalog, viajeVE()).input)).not.toThrow();
  });
});

// ── El armado puro ────────────────────────────────────────────────────────────────────────────

describe('locationsFromZones', () => {
  it('una ubicación por zona: el id de la zona ES el de la ubicación', async () => {
    const catalog = await loadTarifasCatalog('VE', null);
    const locations = locationsFromZones(catalog);

    expect(locations.length).toBeGreaterThan(0);
    for (const l of locations) {
      expect(l.id).toBe(l.zoneId);
      expect(l.countryId).toBe('VE');
    }
  });

  it('no incluye zonas de otros países', async () => {
    const catalog = await loadTarifasCatalog('VE', null);
    expect(locationsFromZones(catalog).some((l) => l.id.startsWith('Z_CR'))).toBe(false);
  });
});

describe('buildCalculateInput', () => {
  let catalog: TarifasCatalog;
  beforeEach(async () => { catalog = await loadTarifasCatalog('VE', null); });

  it('produce una entrada que el motor calcula', () => {
    const { input } = buildCalculateInput(catalog, viajeVE());
    expect(() => calculate(input)).not.toThrow();
  });

  it('una regla por zona aplica sin que nadie teclee la zona', () => {
    const { input } = buildCalculateInput(catalog, viajeVE());
    expect(calculate(input).trace.map((l) => l.ruleCode)).toContain('R1');
  });

  it('un viaje SIN origen (solo destino, como los de guía de despacho) se calcula igual', () => {
    const { input, issues } = buildCalculateInput(catalog, viajeVE({ originLocationId: '' }));
    expect(issues).toEqual([]);
    const result = calculate(input);
    // R1 exige origen CCS: sin origen no aplica, y eso es lo esperado, no un error.
    expect(result.trace.map((l) => l.ruleCode)).not.toContain('R1');
    expect(result.discarded.find((d) => d.ruleCode === 'R1')?.reason).toBe('CONDITION_FALSE');
  });

  it('bloquea —y no rompe— cuando el viaje no tiene zona destino', () => {
    const { issues } = buildCalculateInput(catalog, viajeVE({ destLocationId: '' }));
    expect(issues.some((i) => i.message.includes('no tiene zona de destino'))).toBe(true);
  });

  it('avisa —y no rompe— cuando la zona del viaje no existe en el país', () => {
    const { issues } = buildCalculateInput(catalog, viajeVE({ originLocationId: 'Z_BORRADA' }));
    expect(issues.some((i) => i.message.includes('zona de origen'))).toBe(true);
  });

  it('la capacidad del camión viaja con el viaje, sin catálogo por compañía', () => {
    const { input, warnings } = buildCalculateInput(catalog, viajeVE({ truckTypeId: 'NPR', truckVolumeM3: 12, truckWeightTons: 3.5 }));
    expect(input.trip.truckVolumeM3).toBe(12);
    expect(input.trip.truckWeightTons).toBe(3.5);
    expect(warnings).toEqual([]);
  });

  it('avisa cuando el vehículo del viaje no tiene capacidad cargada', () => {
    const { warnings } = buildCalculateInput(catalog, viajeVE({ truckTypeId: 'NPR' }));
    expect(warnings.some((w) => w.includes('NPR') && w.includes('no tiene capacidad cargada'))).toBe(true);
  });

  it('pasa los montos corregidos a mano y las reglas ad-hoc', () => {
    const { input } = buildCalculateInput(catalog, viajeVE(), {
      overrides: { R1: { value: '999.00', reason: 'Acuerdo puntual' } },
    });
    expect(input.overrides).toEqual({ R1: { value: '999.00', reason: 'Acuerdo puntual' } });
  });

  it('es PURO: dos llamadas con la misma entrada dan el mismo resultado', () => {
    const a = buildCalculateInput(catalog, viajeVE());
    const b = buildCalculateInput(catalog, viajeVE());
    expect(calculate(a.input).totalLiquidado).toBe(calculate(b.input).totalLiquidado);
  });
});

// ── El perfil entra como ARGUMENTO ────────────────────────────────────────────────────────────

describe('cambiar de perfil cambia el cálculo', () => {
  it('cada perfil trae sus propias reglas, tarifario y variables', async () => {
    await db().insert('pricingRule', {
      country_id: 'VE', scope: 'PARTY', party_id: 'CARRIER_VE_1',
      code: 'BONO_PROPIO', name: 'Bono de la compañía', stage: 'SURCHARGE', priority: 50,
      stacking: 'SUM', exclusion_group: null,
      conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: '77.00' },
      is_adhoc: false, active: true, version: 1,
    });

    const sinPerfil = calculate(buildCalculateInput(await loadTarifasCatalog('VE', null), viajeVE()).input);
    const conPerfil = calculate(
      buildCalculateInput(await loadTarifasCatalog('VE', 'CARRIER_VE_1'), viajeVE({ partyId: 'CARRIER_VE_1' })).input,
    );

    expect(sinPerfil.trace.map((l) => l.ruleCode)).not.toContain('BONO_PROPIO');
    expect(conPerfil.trace.map((l) => l.ruleCode)).toContain('BONO_PROPIO');
    expect(Number(conPerfil.totalLiquidado) - Number(sinPerfil.totalLiquidado)).toBe(77);
  });
});

describe('variables personalizadas y estructura de costos llegan al motor', () => {
  it('una constante del perfil llega al motor', async () => {
    await db().insert('partyVariable', {
      party_id: 'CARRIER_VE_1', key: 'custom:bono_zona', label: 'Bono de zona',
      kind: 'NUMBER', origin: 'CONSTANT', default_value: '25', unit: null, active: true,
    });
    await db().insert('pricingRule', {
      country_id: 'VE', scope: 'PARTY', party_id: 'CARRIER_VE_1',
      code: 'BONO', name: 'Bono de zona', stage: 'SURCHARGE', priority: 50, stacking: 'SUM',
      exclusion_group: null, conditions: { p: 'ALWAYS' },
      expression: { op: 'PER_UNIT', unit: 'custom:bono_zona', rate: '2' },
      is_adhoc: false, active: true, version: 1,
    });

    const catalog = await loadTarifasCatalog('VE', 'CARRIER_VE_1');
    const result = calculate(buildCalculateInput(catalog, viajeVE({ partyId: 'CARRIER_VE_1' })).input);

    expect(result.trace.find((l) => l.ruleCode === 'BONO')?.final).toBe('50.00'); // 25 × 2, no 0
    expect(result.warnings.some((w) => w.includes('custom:bono_zona'))).toBe(false);
  });

  it('la estructura de costos del perfil manda sobre los parámetros del país', async () => {
    const estructura = await db().insert('costStructure', {
      party_id: 'CARRIER_VE_1', country_id: 'VE', name: 'Estructura real',
      operating_days_per_month: 30, effective_from: null, active: true, notes: null,
    });
    await db().insert('costStructureRow', {
      structure_id: estructura.id, code: 'NOMINA', label: 'Nómina del conductor',
      driver: 'PER_MONTH_PRORATED', amount: '900', sign: 'ADD', applies_when: null,
      unit: null, row_order: 1, active: true,
    });

    const catalog = await loadTarifasCatalog('VE', 'CARRIER_VE_1');
    const result = calculate(buildCalculateInput(catalog, viajeVE({ partyId: 'CARRIER_VE_1' })).input);

    expect(result.cost.modelId).toBe(estructura.id);
    expect(result.cost.breakdown.map((l) => l.ruleCode)).toContain('NOMINA');
  });
});
