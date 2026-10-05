// Flujo completo del liquidador contra Aurora REAL, dentro de una transacción que SIEMPRE se revierte:
// no deja ni una fila en la base compartida.
//
// Valida lo que los tests con semilla local no pueden: el esquema aplicado (`sql/19`), las vistas
// `tarifas_v_viajes` / `tarifas_v_devoluciones`, el índice único de "una liquidación vigente por
// viaje", las FK, los permisos del rol de la app y la orquestación de emitir / re-liquidar / cambiar
// estado.
//
// Opt-in (necesita el túnel a Aurora, ver docs/guides/tunel-ssm-a-rds.md):
//   TARIFAS_AURORA_E2E=1 npx vitest run src/lib/tarifas/__tests__/aurora.e2e.test.ts
//
// Los costos y la regla que usa se insertan DENTRO de la transacción: son datos de prueba, no de negocio.

/* global process */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, setDataSource } from '../data';
import { PgDataSource } from './helpers/pgDataSource';
import { calculateTrip } from '../tripSettlement';
import { activeStructure } from '../costStructureDataSource';
import { allocationAddsUp } from '../allocation';
import { ensurePartyProfile } from '../partiesDataSource';
import { listLiquidableTrips } from '../tripsDataSource';
import {
  emitSettlement, listSettlements, listTripSettlements, reliquidateSettlement, updateSettlementStatus,
  type SettlementInput,
} from '../settlementsDataSource';
import type { TripCalculation } from '../tripSettlement';
import type { TripRecord } from '../types';

try {
  process.loadEnvFile(new URL('../../../../.env.local', import.meta.url));
} catch {
  // Sin .env.local: las TMS_DB_* pueden venir del entorno.
}

const enabled = process.env.TARIFAS_AURORA_E2E === '1';

// Cada operación cruza el túnel SSM (~0,1 s) y lleva su SAVEPOINT: el cálculo completo tarda segundos.
describe.skipIf(!enabled)('Liquidador contra Aurora (transacción revertida)', { timeout: 120_000 }, () => {
  let client: pg.Client;
  let trip: TripRecord;
  let partyId: string;
  let countryId: string;
  let countBefore: number;

  const inputFrom = (calculation: TripCalculation): SettlementInput => ({
    trip: calculation.trip,
    partyId: calculation.partyId,
    edits: { customVars: {} },
    status: 'Borrador',
    notes: null,
    marginReason: null,
    context: calculation.context,
    calc: calculation.result,
    totalAmount: calculation.result.totalLiquidado,
  });

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
    countBefore = Number((await client.query('select count(*) from tarifas_settlements')).rows[0].count);
    await client.query('BEGIN');
    setDataSource(new PgDataSource(client));

    const country = (await db().find('country', { where: [{ column: 'name', op: 'eq', value: 'Costa Rica' }] }))[0];
    countryId = country.id;
    const trips = await listLiquidableTrips({ countryId });
    const outsourced = trips.find((t) => t.isOwnFleet === false && t.carrierId && t.vehicleType && t.destZoneCode);
    if (!outsourced) throw new Error('No hay un viaje de tercero completado para probar.');
    trip = outsourced;

    // Datos de prueba, solo dentro de la transacción: perfil, tarifa plana y una regla BASE fija.
    const ensured = await ensurePartyProfile(trip.carrierId as string);
    if (ensured.status !== 'saved') throw new Error(ensured.error.message);
    partyId = ensured.partyId;
    await db().insert('pricingRule', {
      country_id: countryId, scope: 'COUNTRY', party_id: null, code: 'E2E_BASE', name: 'Base de prueba E2E',
      stage: 'BASE', priority: 10, stacking: 'SUM', exclusion_group: null, conditions: { p: 'ALWAYS' },
      expression: { op: 'FIXED', amount: '250.00' }, is_adhoc: false, active: true, version: 1,
    });
  });

  afterAll(async () => {
    setDataSource(null);
    if (client) {
      await client.query('ROLLBACK');
      const countAfter = Number((await client.query('select count(*) from tarifas_settlements')).rows[0].count);
      expect(countAfter).toBe(countBefore); // la base quedó como estaba
      await client.end();
    }
  });

  it('calcula el viaje del catálogo con la regla y el costo de prueba', async () => {
    const result = await calculateTrip(trip.id, { customVars: {} });
    expect(result.status, JSON.stringify(result)).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.calculation.notLiquidableReason).toBeNull();
    expect(result.calculation.blockingIssues).toEqual([]);
    expect(Number(result.calculation.result.totalLiquidado)).toBe(250);
  });

  it('emite, y el viaje deja de estar por liquidar', async () => {
    const calculation = await calcOk();
    const emitted = await emitSettlement(inputFrom(calculation));
    expect(emitted.status).toBe('saved');

    const pending = await listLiquidableTrips({ countryId });
    expect(pending.some((t) => t.id === trip.id)).toBe(false);
    expect((await listTripSettlements(trip.id)).filter((s) => s.status !== 'Anulado')).toHaveLength(1);
  });

  it('rechaza una segunda liquidación vigente del mismo viaje', async () => {
    const calculation = await calcOk(true);
    const again = await emitSettlement(inputFrom(calculation));
    expect(again.status).not.toBe('saved');
  });

  it('re-liquida: anula la vigente, emite otra y deja historial', async () => {
    const [current] = (await listTripSettlements(trip.id)).filter((s) => s.status !== 'Anulado');
    const calculation = await calcOk(true);
    const result = await reliquidateSettlement(current.id, inputFrom(calculation), 'Corrección de prueba E2E');
    expect(result.status).toBe('saved');

    const all = await listTripSettlements(trip.id);
    expect(all).toHaveLength(2);
    const voided = all.find((s) => s.id === current.id);
    expect(voided?.status).toBe('Anulado');
    expect(voided?.supersededBy).toBe(result.status === 'saved' ? result.settlement.id : null);
    expect(all.filter((s) => s.status !== 'Anulado')).toHaveLength(1);
  });

  it('cambia el estado de la vigente y deja bitácora', async () => {
    const [vigente] = (await listTripSettlements(trip.id)).filter((s) => s.status !== 'Anulado');
    const changed = await updateSettlementStatus(vigente.id, 'En Revisión');
    expect(changed.error).toBeNull();
    expect((await listSettlements({ countryId })).find((s) => s.id === vigente.id)?.status).toBe('En Revisión');

    const log = await db().find('auditLog', {});
    expect(log.length).toBeGreaterThanOrEqual(3); // emitir, re-liquidar, cambiar estado
  });

  it('flota propia: el total es la acumulación de gastos y la mercancía sale de los pedidos de las guías', async () => {
    const structure = await activeStructure(null, countryId);
    const own = (await listLiquidableTrips({ countryId })).find((t) => t.isOwnFleet === true);
    if (!structure || !own) return; // sin estructura de CR cargada o sin viaje propio: nada que comparar

    const result = await calculateTrip(own.id, { customVars: {} });
    expect(result.status, JSON.stringify(result)).toBe('ok');
    if (result.status !== 'ok') return;
    const r = result.calculation.result;

    // El total a pagar es exactamente lo que acumulan las filas de la estructura (no hay reglas de CR).
    expect(r.trace.every((l) => l.source === 'COST_ROW' || l.source === 'RULE')).toBe(true);
    expect(Number(r.totalLiquidado)).toBeCloseTo(
      r.trace.filter((l) => l.source === 'COST_ROW').reduce((sum, l) => sum + Number(l.final), 0)
        + r.trace.filter((l) => l.source === 'RULE').reduce((sum, l) => sum + Number(l.final), 0),
      2,
    );
    // Los pedidos del viaje (vista tarifas_v_viaje_cargas) alimentan la auditoría y el reparto por casa.
    const cargo = result.calculation.input.cargo;
    if (cargo && Number(cargo.value) > 0) {
      expect(r.margin.basis).toBe('CARGO');
      expect(r.margin.expense).toBe(r.totalLiquidado);
      expect(r.allocation?.shares.length).toBe(cargo.parts.length);
      expect(allocationAddsUp(r.allocation!)).toBe(true);
    }
  });

  async function calcOk(allowSettled = false): Promise<TripCalculation> {
    const result = await calculateTrip(trip.id, { customVars: {} }, allowSettled ? { allowSettled: true } : undefined);
    if (result.status !== 'ok') throw new Error(`cálculo no disponible: ${JSON.stringify(result)}`);
    return result.calculation;
  }
});
