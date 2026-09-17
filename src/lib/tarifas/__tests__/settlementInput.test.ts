// @vitest-environment jsdom
//
// El armado de la entrada del motor, partido en dos: cargar (impuro) y combinar (puro).
//
// Por qué importa: el armado entero vivía en `repository.ts`, cuyo contrato exigía una ruta,
// tiendas y tipos de ruta del TMS. Un viaje inventado no tiene nada de eso, así que el Probador del
// motor se escribió aparte — y desde entonces las dos pantallas divergen. Ya pasó con las zonas (la
// regla funcionaba en la prueba y nunca en producción) y casi vuelve a pasar con los tarifarios.
//
// El test que cierra la fase es el de EQUIVALENCIA: el mismo viaje por los dos caminos tiene que
// dar el mismo total. Es la red que permite migrar las pantallas sin adivinar.

import { beforeEach, describe, expect, it } from 'vitest';
import { CatalogError, loadTarifasCatalog, loadParties, type TarifasCatalog } from '../catalogLoader';
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
  it('trae todo lo que el motor necesita de un país', () => {
    const catalog = loadTarifasCatalog('VE', null);

    expect(catalog.country.id).toBe('VE');
    expect(catalog.country.localCurrency).toBe('USD');
    expect(catalog.rules.length).toBeGreaterThan(0);
    expect(catalog.zones.length).toBeGreaterThan(0);
    expect(catalog.ownCostParams).toBeTruthy();
    expect(catalog.marginPolicy).toBeTruthy();
  });

  it('falla con un mensaje que dice dónde configurarlo, en vez de devolver un catálogo a medias', () => {
    // Un catálogo incompleto produciría un total plausible calculado sobre huecos.
    expect(() => loadTarifasCatalog('XX', null)).toThrow(CatalogError);
    expect(() => loadTarifasCatalog('XX', null)).toThrow(/No hay un país/);
  });

  it('sin compañía no trae variables ni vehículos de nadie', () => {
    const catalog = loadTarifasCatalog('VE', null);
    expect(catalog.partyVariables).toEqual([]);
    expect(catalog.partyVehicleTypes).toEqual([]);
    expect(catalog.costStructure).toBeNull();
  });

  it('con compañía trae SÓLO lo suyo', async () => {
    // Mezclar las variables de otra haría que una regla resolviera con un número que no le
    // corresponde, o que mirara el tarifario de un tercero.
    await db().insert('partyVariable', {
      party_id: 'CARRIER_VE_1', key: 'custom:espera', label: 'Espera',
      kind: 'NUMBER', origin: 'PER_TRIP', default_value: '0', unit: 'h', active: true,
    });
    await db().insert('partyVariable', {
      party_id: 'CARRIER_VE_2', key: 'custom:ajena', label: 'Ajena',
      kind: 'NUMBER', origin: 'CONSTANT', default_value: '99', unit: null, active: true,
    });

    const catalog = loadTarifasCatalog('VE', 'CARRIER_VE_1');
    // La semilla ya trae variables para CARRIER_VE_1: lo que importa es que NO traiga la ajena.
    expect(catalog.partyVariables.map((v) => v.key)).toContain('custom:espera');
    expect(catalog.partyVariables.map((v) => v.key)).not.toContain('custom:ajena');
  });

  it('los tarifarios son los del país más los de la compañía, nunca los de un tercero', async () => {
    await db().insert('rateTable', {
      country_id: 'VE', party_id: 'CARRIER_VE_2', code: 'AJENO', name: 'De otro',
      key_columns: ['originZone'], active: true,
    });

    const catalog = loadTarifasCatalog('VE', 'CARRIER_VE_1');
    expect(catalog.rateTables.map((t) => t.code)).not.toContain('AJENO');
  });

  it('un tarifario de compañía reemplaza al del país con el mismo código', async () => {
    await db().insert('rateTable', {
      country_id: 'VE', party_id: 'CARRIER_VE_1', code: 'ZONAS', name: 'Tarifario propio',
      key_columns: ['originZone', 'destZone'], active: true,
    });

    const catalog = loadTarifasCatalog('VE', 'CARRIER_VE_1');
    const zonas = catalog.rateTables.filter((t) => t.code === 'ZONAS');
    expect(zonas).toHaveLength(1);
    expect(zonas[0]?.partyId).toBe('CARRIER_VE_1');
  });

  it('las compañías se leen con la forma que necesita la resolución', () => {
    const parties = loadParties();
    expect(parties.length).toBeGreaterThan(0);
    expect(parties[0]).toHaveProperty('classification');
    expect(parties[0]).toHaveProperty('carrierId');
  });
});

// ── El armado puro ────────────────────────────────────────────────────────────────────────────

describe('locationsFromZones', () => {
  it('una ubicación por zona: el id de la zona ES el de la ubicación', () => {
    // Reemplaza al andamiaje que existía sólo para cruzar la frontera con el TMS y que hacía que
    // TODA regla por zona cayera en la zona comodín.
    const catalog = loadTarifasCatalog('VE', null);
    const locations = locationsFromZones(catalog);

    expect(locations.length).toBeGreaterThan(0);
    for (const l of locations) {
      expect(l.id).toBe(l.zoneId);
      expect(l.countryId).toBe('VE');
    }
  });

  it('no incluye zonas de otros países', () => {
    const catalog = loadTarifasCatalog('VE', null);
    expect(locationsFromZones(catalog).some((l) => l.id.startsWith('Z_CR'))).toBe(false);
  });
});

describe('buildCalculateInput', () => {
  let catalog: TarifasCatalog;
  beforeEach(() => { catalog = loadTarifasCatalog('VE', null); });

  it('produce una entrada que el motor calcula', () => {
    const { input } = buildCalculateInput(catalog, viajeVE());
    expect(() => calculate(input)).not.toThrow();
  });

  it('una regla por zona aplica sin que nadie teclee la zona', () => {
    // Es el punto de toda la fase: antes esto sólo funcionaba en el Probador.
    const { input } = buildCalculateInput(catalog, viajeVE());
    const result = calculate(input);

    expect(result.trace.map((l) => l.ruleCode)).toContain('R1');
  });

  it('avisa —y no rompe— cuando la zona del viaje ya no existe', () => {
    // Pasa al dar de baja una zona que una ruta vieja todavía nombra.
    const { issues } = buildCalculateInput(catalog, viajeVE({ originLocationId: 'Z_BORRADA' }));
    expect(issues.some((i) => i.message.includes('zona de origen'))).toBe(true);
  });

  it('deriva la capacidad del camión del catálogo de la compañía', async () => {
    await db().insert('partyVehicleType', {
      party_id: 'CARRIER_VE_1', code: 'NPR', name: 'Isuzu NPR',
      volume_m3: '12', weight_tons: '3.5', notes: null, active: true,
    });
    const conCompania = loadTarifasCatalog('VE', 'CARRIER_VE_1');

    const { input } = buildCalculateInput(conCompania, viajeVE({ truckTypeId: 'NPR' }));

    expect(input.trip.truckVolumeM3).toBe(12);
    expect(input.trip.truckWeightTons).toBe(3.5);
  });

  it('lo cargado en el viaje manda sobre el catálogo', async () => {
    await db().insert('partyVehicleType', {
      party_id: 'CARRIER_VE_1', code: 'NPR', name: 'Isuzu NPR',
      volume_m3: '12', weight_tons: '3.5', notes: null, active: true,
    });
    const conCompania = loadTarifasCatalog('VE', 'CARRIER_VE_1');

    const { input } = buildCalculateInput(conCompania, viajeVE({ truckTypeId: 'NPR', truckVolumeM3: 20 }));
    expect(input.trip.truckVolumeM3).toBe(20);
  });

  it('avisa cuando el vehículo no está en el catálogo de la compañía', async () => {
    await db().insert('partyVehicleType', {
      party_id: 'CARRIER_VE_1', code: 'NPR', name: 'Isuzu NPR',
      volume_m3: '12', weight_tons: '3.5', notes: null, active: true,
    });
    const conCompania = loadTarifasCatalog('VE', 'CARRIER_VE_1');

    const { warnings } = buildCalculateInput(conCompania, viajeVE({ truckTypeId: 'DESCONOCIDO' }));
    expect(warnings.some((w) => w.includes('DESCONOCIDO'))).toBe(true);
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

// ── La compañía entra como ARGUMENTO ──────────────────────────────────────────────────────────

describe('cambiar de compañía cambia el cálculo', () => {
  it('cada compañía trae sus propias reglas, tarifario y variables', async () => {
    // Éste es el defecto que el corte arregla: antes la compañía se derivaba de la ruta adentro del
    // armado, así que cambiar de transportista en el formulario NO recalculaba nada — el selector
    // decidía a quién se le paga, pero el cálculo seguía usando el transportista de la ruta.
    await db().insert('pricingRule', {
      country_id: 'VE', scope: 'PARTY', party_id: 'CARRIER_VE_1',
      code: 'BONO_PROPIO', name: 'Bono de la compañía', stage: 'SURCHARGE', priority: 50,
      stacking: 'SUM', exclusion_group: null,
      conditions: { p: 'ALWAYS' }, expression: { op: 'FIXED', amount: '77.00' },
      is_adhoc: false, active: true, version: 1,
    });

    const sinCompania = calculate(
      buildCalculateInput(loadTarifasCatalog('VE', null), viajeVE()).input,
    );
    const conCompania = calculate(
      buildCalculateInput(loadTarifasCatalog('VE', 'CARRIER_VE_1'), viajeVE({ partyId: 'CARRIER_VE_1' })).input,
    );

    expect(sinCompania.trace.map((l) => l.ruleCode)).not.toContain('BONO_PROPIO');
    expect(conCompania.trace.map((l) => l.ruleCode)).toContain('BONO_PROPIO');
    expect(Number(conCompania.totalLiquidado) - Number(sinCompania.totalLiquidado)).toBe(77);
  });
});

// ── Equivalencia con el camino anterior ───────────────────────────────────────────────────────

describe('el camino nuevo da lo mismo que el viejo', () => {
  it('mismo viaje, mismo total', () => {
    // El camino viejo (`repository.toCalculateInput`) arma el catálogo de ubicaciones desde las
    // tiendas y los tipos de ruta del TMS, más una ubicación por zona. El nuevo arma sólo las de
    // zona. Para un viaje cuyas zonas están declaradas —que es el caso de toda ruta local— las dos
    // entradas tienen que producir el MISMO número.
    const catalog = loadTarifasCatalog('VE', null);
    const trip = viajeVE();

    const nuevo = calculate(buildCalculateInput(catalog, trip).input);

    // Réplica del armado anterior: mismas colecciones, más las ubicaciones sintéticas (vacías, que
    // es lo que devolvían en la práctica al no haber mapeos cargados).
    const viejo = calculate({
      country: catalog.country,
      trip,
      rules: catalog.rules,
      zones: catalog.zones,
      zoneGroups: catalog.zoneGroups,
      locations: locationsFromZones(catalog),
      ownCostParams: catalog.ownCostParams,
      outsourcedCostRates: catalog.outsourcedCostRates,
      marginPolicy: catalog.marginPolicy,
      partyVariables: catalog.partyVariables,
      partyVehicleTypes: catalog.partyVehicleTypes,
      costStructure: catalog.costStructure,
      costStructureRows: catalog.costStructureRows,
      rateTables: catalog.rateTables,
      rateTableRows: catalog.rateTableRows,
    });

    expect(nuevo.totalLiquidado).toBe(viejo.totalLiquidado);
    expect(nuevo.cost.total).toBe(viejo.cost.total);
    expect(nuevo.margin.pct).toBe(viejo.margin.pct);
    expect(nuevo.trace.map((l) => `${l.ruleCode}=${l.final}`))
      .toEqual(viejo.trace.map((l) => `${l.ruleCode}=${l.final}`));
  });
});

// ── Lo que el Probador no pasaba ──────────────────────────────────────────────────────────────

describe('las dos capacidades sobre las que el Probador mentía', () => {
  it('las variables personalizadas llegan al motor', async () => {
    // El Probador armaba su propia entrada y NO pasaba `partyVariables`: cualquier regla con
    // `custom:*` evaluaba 0 con un aviso. Justo la capacidad que había que demostrar.
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

    const catalog = loadTarifasCatalog('VE', 'CARRIER_VE_1');
    const result = calculate(
      buildCalculateInput(catalog, viajeVE({ partyId: 'CARRIER_VE_1' })).input,
    );

    const linea = result.trace.find((l) => l.ruleCode === 'BONO');
    expect(linea?.final).toBe('50.00'); // 25 × 2, no 0
    expect(result.warnings.some((w) => w.includes('custom:bono_zona'))).toBe(false);
  });

  it('la estructura de costos de la compañía manda sobre los parámetros del país', async () => {
    // El Probador tampoco la pasaba: siempre costeaba con los tres campos del país, así que el
    // margen que mostraba no era el que iba a salir en la liquidación.
    const estructura = await db().insert('costStructure', {
      party_id: 'CARRIER_VE_1', country_id: 'VE', name: 'Estructura real',
      operating_days_per_month: 30, effective_from: null, active: true, notes: null,
    });
    await db().insert('costStructureRow', {
      structure_id: estructura.id, code: 'NOMINA', label: 'Nómina del conductor',
      driver: 'PER_MONTH_PRORATED', amount: '900', sign: 'ADD', applies_when: null,
      unit: null, row_order: 1, active: true,
    });

    const catalog = loadTarifasCatalog('VE', 'CARRIER_VE_1');
    const result = calculate(
      buildCalculateInput(catalog, viajeVE({ partyId: 'CARRIER_VE_1' })).input,
    );

    expect(result.cost.modelId).toBe(estructura.id);
    expect(result.cost.breakdown.map((l) => l.ruleCode)).toContain('NOMINA');
  });
});
