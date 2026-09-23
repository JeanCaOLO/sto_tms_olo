// @vitest-environment jsdom
//
// El recorrido completo, con los datos de la semilla: elegir una ruta, un conductor y un vehículo,
// cargar lo del día, calcular y emitir.
//
// Es la prueba de que las piezas encajan. Cada una tiene sus tests; ésta verifica que juntas hacen
// lo que el módulo promete — y sobre todo que **las reglas por zona y las variables personalizadas
// aplican sin que nadie las teclee**, que era lo que no pasaba antes.

import { beforeEach, describe, expect, it } from 'vitest';
import { calculate } from '../index';
import { loadParties, loadTarifasCatalog } from '../catalogLoader';
import { buildCalculateInput } from '../settlementInput';
import { listRoutesByCountry } from '../routesDataSource';
import { listDriversByCountry, toDriverOptions } from '../driversDataSource';
import { searchDrivers } from '../driverSearch';
import { emitSettlement, getSettlement } from '../settlementsDataSource';
import {
  applyDriverSelection, applyRouteSelection, availableRoutes, draftProblems, emptyDraft,
  type FormCatalogs,
} from '../settlementForm';
import { buildCustomVarFields, parseCustomVarValues } from '../customVarFields';
import { computeSettlementTotals } from '../settlementTotals';
import { toTripContext } from '../routeTrip';
import { explainResult } from '../explain';
import { db } from '../data';
import type { RouteDef, DriverDef } from '../types';

// La semilla real ya trae liquidaciones de demo (docs/tarifador): estos tests parten de esa
// colección en blanco para poder afirmar números de liquidación exactos (LIQ-0001, ...).
beforeEach(async () => {
  localStorage.clear();
  for (const row of await db().find('settlement')) await db().delete('settlement', row.id);
});

async function catalogos(): Promise<{ catalogs: FormCatalogs; routes: RouteDef[]; drivers: DriverDef[] }> {
  const routes = await listRoutesByCountry('VE');
  const drivers = await listDriversByCountry('VE');
  const parties = loadParties().filter((p) => p.countryId === 'VE');

  return {
    routes,
    drivers,
    catalogs: {
      parties: parties.map((p) => ({ id: p.id, name: p.name, classification: p.classification, status: p.status })),
      routes,
      drivers,
      vehicleTypes: [{ code: 'TT-350', name: 'Isuzu NPR' }, { code: 'TT-750', name: 'Isuzu FRR' }],
    },
  };
}

describe('la semilla trae lo necesario para liquidar', () => {
  it('hay rutas, conductores y vehículos por compañía', async () => {
    const { routes, drivers } = await catalogos();
    expect(routes.length).toBeGreaterThan(0);
    expect(drivers.length).toBeGreaterThan(0);
  });

  it('dos transportistas cubren la MISMA lane', async () => {
    // Es el caso que justifica que el precio viva en la compañía y no en la ruta.
    const { routes } = await catalogos();
    const carCcs = routes.filter((r) => r.code === 'CAR-CCS');
    expect(carCcs.length).toBe(2);
    expect(new Set(carCcs.map((r) => r.partyId)).size).toBe(2);
  });
});

// ── El recorrido ──────────────────────────────────────────────────────────────────────────────

describe('de la guía física al total', () => {
  it('buscar por cédula encuentra al conductor y trae su transportista', async () => {
    const { catalogs, drivers } = await catalogos();
    const parties = loadParties();

    // La guía trae "V12345678", sin puntos ni guiones.
    const opciones = toDriverOptions(drivers, parties.map((p) => ({ id: p.id, name: p.name })));
    const encontrado = searchDrivers(opciones, 'V12345678')[0];

    expect(encontrado?.driver.fullName).toBe('José Ramírez');
    expect(encontrado?.matchedOn).toBe('document');

    const { draft } = applyDriverSelection(emptyDraft(), encontrado!.driver.id, catalogs);
    expect(draft.partyId).toBe('CARRIER_VE_1');
  });

  it('elegido el conductor, sólo se ofrecen las rutas de SU compañía', async () => {
    const { catalogs } = await catalogos();
    const { draft } = applyDriverSelection(emptyDraft(), 'DRV_VE_1', catalogs);

    const rutas = availableRoutes(catalogs, draft.partyId);
    expect(rutas.every((r) => r.partyId === 'CARRIER_VE_1')).toBe(true);
    expect(rutas.map((r) => r.code).sort()).toEqual(['CAR-CCS', 'CAR-ZUL', 'TAC-CCS']);
  });

  it('la ruta aporta los siete números y las dos zonas', async () => {
    const { catalogs, routes } = await catalogos();
    let estado = applyDriverSelection(emptyDraft(), 'DRV_VE_1', catalogs).draft;
    estado = applyRouteSelection(estado, 'RT_VE_A1', catalogs).draft;

    const ruta = routes.find((r) => r.id === estado.routeId)!;
    const trip = toTripContext(ruta, {
      quotedAt: '2026-09-01T10:00:00.000Z',
      partyId: estado.partyId!,
      driverId: estado.driverId,
      truckTypeId: 'TT-350',
    }, 'OUTSOURCED');

    expect(trip).toMatchObject({
      km: 180, clientCount: 40, packageCount: 120, weightKg: 1200,
      tollCount: 3, tollsAmount: '18', durationHours: 4,
      originLocationId: 'Z_VE_CAR', destLocationId: 'Z_VE_CCS',
    });
  });

  it('el borrador queda listo para emitir', async () => {
    const { catalogs } = await catalogos();
    let estado = applyDriverSelection(emptyDraft(), 'DRV_VE_1', catalogs).draft;
    estado = applyRouteSelection(estado, 'RT_VE_A1', catalogs).draft;
    estado = { ...estado, truckTypeCode: 'TT-350' };

    expect(draftProblems(estado, catalogs)).toEqual([]);
  });
});

// ── El cálculo, con todo lo que antes no aplicaba ─────────────────────────────────────────────

describe('el total se arma solo', () => {
  async function liquidar(extras: { pickupCount?: number; horasEspera?: string } = {}) {
    const { routes } = await catalogos();
    const ruta = routes.find((r) => r.id === 'RT_VE_A1')!;
    const catalog = loadTarifasCatalog('VE', 'CARRIER_VE_1');

    const campos = buildCustomVarFields(catalog.partyVariables);
    const { values } = parseCustomVarValues(campos, {
      'custom:horas_espera': extras.horasEspera ?? '0',
    });

    const trip = toTripContext(ruta, {
      quotedAt: '2026-09-01T10:00:00.000Z',
      partyId: 'CARRIER_VE_1',
      driverId: 'DRV_VE_1',
      truckTypeId: 'TT-350',
      pickupCount: extras.pickupCount ?? 0,
      customVars: values,
    }, 'OUTSOURCED');

    const { input } = buildCalculateInput(catalog, trip);
    return { result: calculate(input), catalog };
  }

  it('el vehículo aporta su capacidad desde el catálogo de la compañía', async () => {
    // Antes se tecleaba a mano y, como nadie lo hacía, toda regla por volumen valía cero.
    const { result } = await liquidar();
    expect(result.blockingIssues).toEqual([]);

    const { catalog } = await liquidar();
    expect(catalog.partyVehicleTypes.some((v) => v.code === 'TT-350')).toBe(true);
  });

  it('las recolectas se cobran con la regla de SU transportista', async () => {
    // Es el modelado que pediste: una regla por compañía sobre la cantidad de recolectas.
    const sin = await liquidar();
    const con = await liquidar({ pickupCount: 2 });

    const linea = con.result.trace.find((l) => l.ruleCode === 'R_RECOLECTAS');
    expect(linea?.final).toBe('50.00'); // 2 × 25
    expect(Number(con.result.totalLiquidado) - Number(sin.result.totalLiquidado)).toBe(50);
  });

  it('una variable POR VIAJE llega al motor y suma', async () => {
    // El agujero más silencioso del módulo: `customVars` no lo rellenaba nadie, así que esta regla
    // siempre valía cero.
    const sin = await liquidar();
    const con = await liquidar({ horasEspera: '3' });

    const linea = con.result.trace.find((l) => l.ruleCode === 'R_ESPERA');
    expect(linea?.final).toBe('24.00'); // 3 × 8
    expect(Number(con.result.totalLiquidado) - Number(sin.result.totalLiquidado)).toBe(24);
  });

  it('el desglose explica cada línea: por qué aplicó y cómo se calculó', async () => {
    const { result, catalog } = await liquidar({ pickupCount: 2, horasEspera: '3' });
    const explicacion = explainResult(result, {
      rules: catalog.rules,
      customLabels: Object.fromEntries(catalog.partyVariables.map((v) => [v.key, v.label])),
    });

    const lineas = explicacion.stages.flatMap((s) => s.lines);
    const recolectas = lineas.find((l) => l.ruleCode === 'R_RECOLECTAS')!;

    expect(recolectas.porQue).toContain('Recolectas');
    expect(recolectas.como).toContain('recolecta');
    expect(recolectas.acumulado).toBeTruthy();

    // Y dice qué datos del viaje miró: es la mitad de una auditoría.
    expect(explicacion.variablesUsadas.map((v) => v.key)).toContain('pickupCount');
    expect(explicacion.variablesUsadas.map((v) => v.key)).toContain('custom:horas_espera');
  });
});

// ── La emisión ────────────────────────────────────────────────────────────────────────────────

describe('emitir y volver a leer', () => {
  it('guarda el desglose y se puede releer tal cual', async () => {
    const { routes } = await catalogos();
    const ruta = routes.find((r) => r.id === 'RT_VE_A1')!;
    const catalog = loadTarifasCatalog('VE', 'CARRIER_VE_1');

    const trip = toTripContext(ruta, {
      quotedAt: '2026-09-01T10:00:00.000Z',
      partyId: 'CARRIER_VE_1', driverId: 'DRV_VE_1', truckTypeId: 'TT-350', pickupCount: 2,
    }, 'OUTSOURCED');

    const result = calculate(buildCalculateInput(catalog, trip).input);
    const totals = computeSettlementTotals(result.trace, [], catalog.country);

    const emitida = await emitSettlement({
      countryId: 'VE', partyId: 'CARRIER_VE_1',
      routeId: ruta.id, driverId: 'DRV_VE_1',
      tripNumber: 'V-88123', settlementDate: '2026-09-01',
      truckTypeId: 'TT-350', status: 'Borrador',
      notes: null, marginReason: null,
      trip, calc: result, totalAmount: totals.total,
      returns: [{ invoiceNumber: 'F-1029', productCode: 'SKU-44', kind: 'PARCIAL' }],
    });

    expect(emitida.status).toBe('saved');
    if (emitida.status !== 'saved') return;

    const guardada = await getSettlement(emitida.settlement.id)!;
    expect(guardada?.number).toBe('LIQ-0001');
    expect(guardada?.tripNumber).toBe('V-88123');
    expect(guardada?.totalAmount).toBe(totals.total);
    // Lo que antes se perdía al guardar:
    expect(guardada?.trace.length).toBe(result.trace.length);
    expect(guardada?.trip.km).toBe(180);
    expect(guardada?.returns).toHaveLength(1);
  });

  it('destildar una línea baja el total y queda registrado', async () => {
    const { routes } = await catalogos();
    const ruta = routes.find((r) => r.id === 'RT_VE_A1')!;
    const catalog = loadTarifasCatalog('VE', 'CARRIER_VE_1');
    const trip = toTripContext(ruta, {
      quotedAt: '2026-09-01T10:00:00.000Z',
      partyId: 'CARRIER_VE_1', driverId: 'DRV_VE_1', truckTypeId: 'TT-350', pickupCount: 2,
    }, 'OUTSOURCED');

    const result = calculate(buildCalculateInput(catalog, trip).input);
    const recolectas = result.trace.find((l) => l.ruleCode === 'R_RECOLECTAS')!;
    const totals = computeSettlementTotals(result.trace, [recolectas.seq], catalog.country);

    expect(Number(result.totalLiquidado) - Number(totals.total)).toBe(50);

    const emitida = await emitSettlement({
      countryId: 'VE', partyId: 'CARRIER_VE_1', routeId: ruta.id, driverId: 'DRV_VE_1',
      tripNumber: 'V-2', settlementDate: '2026-09-01', truckTypeId: 'TT-350',
      status: 'Borrador', notes: null, marginReason: null,
      trip, calc: result, totalAmount: totals.total, excludedSeqs: [recolectas.seq],
    });

    if (emitida.status !== 'saved') throw new Error('no se emitió');
    expect(emitida.settlement.excludedSeqs).toEqual([recolectas.seq]);
    expect(emitida.settlement.totalAmount).toBe(totals.total);
  });
});
