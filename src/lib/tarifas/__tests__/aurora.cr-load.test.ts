// Carga REAL de la estructura de costos de la flota propia de Costa Rica en Aurora y una liquidación
// de verificación contra las cifras de la planilla. A diferencia de `aurora.e2e.test.ts`, esto NO se
// revierte: deja datos guardados. Por eso es doblemente opt-in y no corre en la suite normal.
//
//   TARIFAS_CR_LOAD=1 npx vitest run src/lib/tarifas/__tests__/aurora.cr-load.test.ts
//
// Lee los datos de `.test/archivos_para_estructura_de_costos_CR/` (carpeta personal, fuera de git),
// arma con ellos la plantilla base (xlsx), la lee con el mismo `parseCostTemplate` que usa la
// pantalla y la aplica con `applyCostTemplate`.

/* global process */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import * as XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, setDataSource } from '../data';
import { PgDataSource } from './helpers/pgDataSource';
import { applyCostTemplate, activeStructure, listRows } from '../costStructureDataSource';
import { parseCostTemplate, type SheetMatrix } from '../costTemplate';
import { listTruckTypes } from '../vehiclesDataSource';
import { ensurePartyProfile } from '../partiesDataSource';
import { savePartyVariable } from '../partyVariablesDataSource';
import { calculateTrip } from '../tripSettlement';
import { listLiquidableTrips } from '../tripsDataSource';
import { emitSettlement, listTripSettlements, updateSettlementStatus } from '../settlementsDataSource';
import type { Rule, TripRecord } from '../types';

try {
  process.loadEnvFile(new URL('../../../../.env.local', import.meta.url));
} catch {
  // Sin .env.local: las TMS_DB_* pueden venir del entorno.
}

const SOURCE = new URL('../../../../.test/archivos_para_estructura_de_costos_CR/', import.meta.url);
const SQL_FILE = new URL('supabase_setup_olo_costeo.sql', SOURCE);
const enabled = process.env.TARIFAS_CR_LOAD === '1' && existsSync(SQL_FILE);

/** Tipo de camión del catálogo de vehículos que corresponde a cada columna de la planilla. */
function readSource() {
  const sql = readFileSync(SQL_FILE, 'utf8');
  const start = sql.indexOf('insert into costos_variables');
  const block = sql.slice(start, sql.indexOf(';', start));
  const rows = [...block.matchAll(
    /\('((?:[^']|'')*)',\s*'(km|year|month)',\s*'((?:[^']|'')*)',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\d+\)/g,
  )];
  if (rows.length !== 40) throw new Error(`esperaba 40 componentes, hay ${rows.length}`);
  const fijos = [...sql.matchAll(/\('(conductor|ayudante)',\s*'((?:[^']|'')*)',\s*([\d.]+),\s*\d+\)/g)];
  const depreciacion = [...sql.matchAll(/\('(t\d)',\s*(\d+),\s*(\d+)\)/g)]
    .filter((m) => ['t1', 't3', 't5'].includes(m[1]) && Number(m[2]) >= 1000000);
  return { rows, fijos, depreciacion };
}

function buildTemplate(truckOf: Record<'t1' | 't3' | 't5', string>): Record<string, SheetMatrix> {
  const { rows, fijos, depreciacion } = readSource();
  const variables: SheetMatrix = [['componente', 'tipo_camion', 'frecuencia', 'cantidad_frecuencia', 'costo', 'unidad_componente']];
  for (const m of rows) {
    const [name, freq, units] = [m[1].replace(/''/g, "'"), m[2], m[3].replace(/''/g, "'")];
    const por: [keyof typeof truckOf, number, number][] = [
      ['t1', Number(m[4]), Number(m[5])], ['t3', Number(m[6]), Number(m[7])], ['t5', Number(m[8]), Number(m[9])],
    ];
    for (const [t, cada, costo] of por) variables.push([name, truckOf[t], freq, cada, costo, units]);
  }
  const fijosHoja: SheetMatrix = [['concepto', 'monto_mensual', 'aplica_a', 'tipo_camion', 'valor_vehiculo', 'vida_meses']];
  for (const m of fijos) fijosHoja.push([m[2].replace(/''/g, "'"), Number(m[3]), m[1], '', '', '']);
  for (const m of depreciacion) fijosHoja.push(['Depreciación', '', 'depreciacion', truckOf[m[1] as 't1'], Number(m[2]), Number(m[3])]);
  const params: SheetMatrix = [
    ['clave', 'valor'], ['dias_operativos', 30], ['km_anual', 36000], ['precio_combustible', 635],
    [`rendimiento_km_litro:${truckOf.t1}`, 8.5], [`rendimiento_km_litro:${truckOf.t3}`, 6], [`rendimiento_km_litro:${truckOf.t5}`, 4.2],
  ];
  return { Variables: variables, Fijos: fijosHoja, 'Parámetros': params };
}

describe.skipIf(!enabled)('Carga de la estructura de costos de Costa Rica en Aurora', { timeout: 300_000 }, () => {
  let client: pg.Client;
  let countryId = '';
  const informe: Record<string, unknown> = {};
  let passed = 0;

  beforeAll(async () => {
    client = new pg.Client({
      host: process.env.TMS_DB_HOST ?? 'localhost',
      port: Number(process.env.TMS_DB_PORT) || 5432,
      user: process.env.TMS_DB_USER,
      password: process.env.TMS_DB_PASSWORD,
      database: process.env.TMS_DB_NAME ?? 'tms_olo',
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    // Una sola transacción para toda la carga: se confirma al final SOLO si las dos pruebas pasaron;
    // si algo falla, no queda nada a medias.
    await client.query('BEGIN');
    setDataSource(new PgDataSource(client));
    countryId = (await db().find('country', { where: [{ column: 'name', op: 'eq', value: 'Costa Rica' }] }))[0].id;
  });

  afterAll(async () => {
    setDataSource(null);
    if (client) {
      await client.query(passed === 2 ? 'COMMIT' : 'ROLLBACK');
      informe.confirmado = passed === 2;
      await client.end();
    }
    // eslint-disable-next-line no-console
    console.log('INFORME CR', JSON.stringify(informe, null, 2));
  });

  it('arma la plantilla, la lee y la aplica como estructura por defecto de Costa Rica', async () => {
    const trucks = await listTruckTypes({});
    informe.tiposCamionCatalogo = trucks.map((t) => t.code);
    // La planilla distingue 3 camiones (1-2.5 t, 3-4.5 t, 5-7 t); se asocian a los tipos del catálogo por capacidad.
    const sorted = [...trucks].sort((a, b) => (a.maxWeightTons ?? 0) - (b.maxWeightTons ?? 0));
    expect(sorted.length).toBeGreaterThanOrEqual(1);
    const pick = (i: number) => sorted[Math.min(i, sorted.length - 1)].code;
    const truckOf = { t1: pick(0), t3: pick(Math.floor(sorted.length / 2)), t5: pick(sorted.length - 1) };
    informe.tiposAsignados = truckOf;

    // Se escribe y se vuelve a leer el .xlsx real: lo mismo que haría quien sube el archivo.
    const dir = join(tmpdir(), 'tarifas-cr');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'plantilla_estructura_costos_cr.xlsx');
    const wb = XLSX.utils.book_new();
    for (const [name, matrix] of Object.entries(buildTemplate(truckOf))) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), name);
    }
    XLSX.writeFile(wb, file);
    const read = XLSX.readFile(file);
    const sheets = Object.fromEntries(
      read.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<(string | number)[]>(read.Sheets[n], { header: 1, defval: '' })]),
    );

    const parsed = parseCostTemplate(sheets, { knownTruckTypes: trucks.map((t) => t.code) });
    informe.errores = parsed.errors;
    informe.avisos = parsed.warnings;
    informe.resumen = parsed.summary;
    expect(parsed.errors).toEqual([]);

    const applied = await applyCostTemplate({
      partyId: null, countryId, name: 'Flota propia Costa Rica',
      operatingDaysPerMonth: parsed.operatingDays ?? 30, params: parsed.params, rows: parsed.rows,
    });
    expect(applied.status).toBe('saved');
    const active = await activeStructure(null, countryId);
    expect(active?.name).toBe('Flota propia Costa Rica');
    informe.filasGuardadas = (await listRows(active!.id)).length;
    expect(informe.filasGuardadas).toBe(parsed.rows.length);
    passed += 1;
  });

  it('liquida un viaje de flota propia y el costo coincide con la planilla', async () => {
    const trips = await listLiquidableTrips({ countryId });
    const own: TripRecord | undefined = trips.find((t) => t.isOwnFleet === true && t.carrierId && t.vehicleType);
    expect(own, 'no hay un viaje de flota propia completado').toBeTruthy();
    const trip = own!;
    informe.viaje = { numero: trip.routeNumber, camion: trip.vehicleType, km: trip.km, transportista: trip.carrierName };

    const profile = await ensurePartyProfile(trip.carrierId as string);
    if (profile.status !== 'saved') throw new Error(profile.error.message);
    // Variable por viaje que activa la fila del ayudante.
    const saved = await savePartyVariable({
      partyId: profile.partyId, key: 'con_ayudante', label: 'Con ayudante', kind: 'NUMBER', origin: 'PER_TRIP',
      defaultValue: '0', unit: null, active: true,
    });
    if (saved.status === 'invalid') {
      const dup = Object.values(saved.errors).join(' ');
      if (!/ya existe|ya hay/i.test(dup)) throw new Error(dup);
    }

    // Total de prueba SOLO para este cálculo (regla ad-hoc, no se guarda en el catálogo): sin reglas de
    // tarifa cargadas el viaje no tendría qué liquidar, y no se inventa una tarifa en la base.
    const adhoc: Rule = {
      id: 'adhoc-cr-prueba', countryId, code: 'ADHOC_CR_PRUEBA', name: 'Total de prueba (verificación de costos)',
      stage: 'BASE', priority: 10, stacking: 'SUM', exclusionGroup: null, conditions: { p: 'ALWAYS' },
      expression: { op: 'FIXED', amount: '100000.00' }, isAdhoc: true, active: true, version: 1,
    };

    const calc = await calculateTrip(trip.id, { customVars: { 'custom:con_ayudante': 1 } }, { adhocRules: [adhoc] });
    if (calc.status !== 'ok') throw new Error(`cálculo no disponible: ${JSON.stringify(calc)}`);
    const c = calc.calculation;
    informe.blocking = c.blockingIssues;
    informe.warnings = c.warnings;
    informe.notLiquidable = c.notLiquidableReason;
    informe.costoTotal = c.result.cost.total;
    informe.costoLineas = c.result.cost.breakdown.length;
    informe.margen = c.result.margin;
    informe.modelo = c.result.cost.modelId;

    // Cifras de la planilla para el camión que corresponda: fijo diario + km × (mantenimiento + combustible).
    const resumen = (informe.resumen as { truckType: string; fixedDaily: string; variablePerKm: string; fuelPerKm: string | null }[])
      .find((s) => s.truckType === trip.vehicleType);
    expect(resumen, `la plantilla no trae el camión ${trip.vehicleType}`).toBeTruthy();
    const dias = 1; // sin pernocta
    const esperado = Number(resumen!.fixedDaily) * dias + trip.km * (Number(resumen!.variablePerKm) + Number(resumen!.fuelPerKm ?? 0));
    informe.costoEsperado = esperado;
    expect(Number(c.result.cost.total)).toBeCloseTo(esperado, 0);
    expect(c.notLiquidableReason).toBeNull();
    expect(c.blockingIssues).toEqual([]);

    const emitted = await emitSettlement({
      trip: c.trip, partyId: c.partyId, edits: { customVars: { 'custom:con_ayudante': 1 } }, status: 'Borrador',
      notes: 'Verificación de la estructura de costos de Costa Rica contra la planilla',
      marginReason: null,
      context: c.context, calc: c.result, adhocRules: [adhoc],
      totalAmount: c.result.totalLiquidado,
    });
    informe.emision = emitted.status;
    expect(emitted.status).toBe('saved');
    const vigentes = (await listTripSettlements(trip.id)).filter((s) => s.status !== 'Anulado');
    expect(vigentes).toHaveLength(1);

    // El total era de prueba: se anula para no dejar una liquidación sin sentido de negocio. El viaje vuelve a la bandeja.
    const voided = await updateSettlementStatus(vigentes[0].id, 'Anulado');
    expect(voided.error).toBeNull();
    informe.anulada = true;
    passed += 1;
  });
});
