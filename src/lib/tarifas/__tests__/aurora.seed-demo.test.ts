// Verifica contra Aurora REAL (solo lectura) que los datos de prueba de `scripts/seed-tarifas-demo.mjs`
// dejan calculables a los viajes liquidables: ninguno termina en "sin lógica" y los de terceros pagan > 0.
//
// Opt-in (necesita el túnel a Aurora):
//   TARIFAS_AURORA_SEED=1 npx vitest run src/lib/tarifas/__tests__/aurora.seed-demo.test.ts

/* global process */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setDataSource } from '../data';
import { PgDataSource } from './helpers/pgDataSource';
import { calculateTrip } from '../tripSettlement';
import { listLiquidableTrips } from '../tripsDataSource';
import type { TripRecord } from '../types';

try {
  process.loadEnvFile(new URL('../../../../.env.local', import.meta.url));
} catch {
  // Sin .env.local: las TMS_DB_* pueden venir del entorno.
}

const enabled = process.env.TARIFAS_AURORA_SEED === '1';

describe.skipIf(!enabled)('Datos de prueba del tarifador sobre Aurora', { timeout: 240_000 }, () => {
  let client: pg.Client;
  let trips: TripRecord[] = [];

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
    await client.query('BEGIN READ ONLY');
    setDataSource(new PgDataSource(client));
    trips = await listLiquidableTrips({});
  });

  afterAll(async () => {
    setDataSource(null);
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('todo viaje liquidable calcula, con total mayor a cero', async () => {
    expect(trips.length).toBeGreaterThan(0);
    const rows: string[] = [];
    const failures: string[] = [];
    for (const trip of trips) {
      const r = await calculateTrip(trip, { customVars: {} });
      const who = `${trip.routeNumber} ${trip.isOwnFleet ? 'PROPIA' : 'TERCERO'} ${trip.carrierName} ${trip.vehicleType} zona ${trip.destZoneCode}`;
      if (r.status !== 'ok') { failures.push(`${who}: ${r.message}`); continue; }
      const total = Number(r.calculation.result.totalLiquidado);
      rows.push(`${who} => ${total} (${r.calculation.result.trace.length} líneas, ${r.calculation.blockingIssues.length} bloqueos)`);
      if (!(total > 0)) failures.push(`${who}: total ${total}`);
      expect(r.calculation.blockingIssues, who).toEqual([]);
    }
    console.log(rows.join('\n'));
    expect(failures).toEqual([]);
  });
});
