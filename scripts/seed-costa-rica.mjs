// Dataset MOCK de Costa Rica (prompt de implementación §21). Genera clientes
// finales representativos para EPA y COFERSA, con suficiente volumen y
// dispersión geográfica real para poder probar clustering/ruteo más adelante
// (Fase 8) — no 3 registros triviales.
//
// Requiere que sql/06_fase1_multicountry_foundation.sql ya esté aplicada
// (warehouses/customers/final_customers/delivery_points/addresses).
//
// Uso:
//   node --env-file=.env.local scripts/seed-costa-rica.mjs           (dry-run: solo reporta)
//   node --env-file=.env.local scripts/seed-costa-rica.mjs --execute (inserta)
//
// Idempotente: usa external_code fijo por fila y ON CONFLICT DO NOTHING —
// correrlo dos veces no duplica datos.

import pg from 'pg';

const execute = process.argv.includes('--execute');

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

// Coordenadas reales aproximadas de cantones de Costa Rica — suficientes
// para probar distancia/clustering, sin pretender precisión de geocoding real.
const EPA_FINAL_CUSTOMERS = [
  { code: 'EPA-SJ-01', name: 'EPA San José Centro', region: 'San José', lat: 9.9333, lon: -84.0833, window: ['08:00', '17:00'] },
  { code: 'EPA-SJ-02', name: 'EPA Desamparados', region: 'San José', lat: 9.8977, lon: -84.0669, window: ['08:00', '17:00'] },
  { code: 'EPA-AL-01', name: 'EPA Alajuela Centro', region: 'Alajuela', lat: 10.0163, lon: -84.2114, window: ['08:00', '16:00'] },
  { code: 'EPA-CA-01', name: 'EPA Cartago Centro', region: 'Cartago', lat: 9.8644, lon: -83.9194, window: ['08:00', '16:00'] },
  { code: 'EPA-HE-01', name: 'EPA Heredia Centro', region: 'Heredia', lat: 9.9989, lon: -84.1169, window: ['08:00', '17:00'] },
  { code: 'EPA-PZ-01', name: 'EPA Pérez Zeledón', region: 'San José', lat: 9.3667, lon: -83.7000, window: ['09:00', '16:00'] },
  { code: 'EPA-LI-01', name: 'EPA Limón Centro', region: 'Limón', lat: 9.9908, lon: -83.0347, window: ['08:00', '15:00'] },
  { code: 'EPA-GU-01', name: 'EPA Liberia (Guanacaste)', region: 'Guanacaste', lat: 10.6346, lon: -85.4370, window: ['08:00', '15:00'] },
];

const COFERSA_FINAL_CUSTOMERS = [
  { code: 'COF-SJ-01', name: 'Ferretería Cofersa San José', region: 'San José', lat: 9.9280, lon: -84.0907, window: ['07:00', '17:00'] },
  { code: 'COF-SJ-02', name: 'Ferretería Cofersa Escazú', region: 'San José', lat: 9.9189, lon: -84.1394, window: ['07:00', '17:00'] },
  { code: 'COF-AL-01', name: 'Ferretería Cofersa Alajuela', region: 'Alajuela', lat: 10.0143, lon: -84.2088, window: ['07:00', '16:00'] },
  { code: 'COF-AL-02', name: 'Ferretería Cofersa San Ramón', region: 'Alajuela', lat: 10.0898, lon: -84.4696, window: ['07:00', '16:00'] },
  { code: 'COF-CA-01', name: 'Ferretería Cofersa Cartago', region: 'Cartago', lat: 9.8600, lon: -83.9200, window: ['07:00', '16:00'] },
  { code: 'COF-PU-01', name: 'Ferretería Cofersa Puntarenas', region: 'Puntarenas', lat: 9.9763, lon: -84.8384, window: ['08:00', '15:00'] },
  { code: 'COF-GU-01', name: 'Ferretería Cofersa Nicoya', region: 'Guanacaste', lat: 10.1483, lon: -85.4520, window: ['08:00', '15:00'] },
];

async function upsertFinalCustomer(client, customerId, countryId, row) {
  const { rows: fcRows } = await client.query(
    `INSERT INTO final_customers (customer_id, external_code, name, region, status)
     VALUES ($1, $2, $3, $4, 'active')
     ON CONFLICT (customer_id, external_code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [customerId, row.code, row.name, row.region],
  );
  const finalCustomerId = fcRows[0].id;

  const { rows: addrRows } = await client.query(
    `INSERT INTO addresses (country_id, city, state, latitude, longitude, geocoding_status, geocoding_provider)
     VALUES ($1, $2, $3, $4, $5, 'OK', 'seed-manual')
     RETURNING id`,
    [countryId, row.name, row.region, row.lat, row.lon],
  );
  const addressId = addrRows[0].id;

  await client.query(
    `INSERT INTO delivery_points (final_customer_id, address_id, external_code, name, delivery_window_start, delivery_window_end, is_default, active)
     VALUES ($1, $2, $3, $4, $5, $6, true, true)
     ON CONFLICT DO NOTHING`,
    [finalCustomerId, addressId, `${row.code}-DP1`, row.name, row.window[0], row.window[1]],
  );

  return finalCustomerId;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: crRows } = await client.query(`SELECT id FROM countries WHERE code = 'CR' LIMIT 1`);
    if (!crRows[0]) throw new Error('No existe el país CR — corré primero sql/06_fase1_multicountry_foundation.sql');
    const countryId = crRows[0].id;

    const { rows: whRows } = await client.query(`SELECT id FROM warehouses WHERE country_id = $1 LIMIT 1`, [countryId]);
    if (!whRows[0]) throw new Error('No existe ningún warehouse para CR — corré primero sql/06_fase1_multicountry_foundation.sql');
    const warehouseId = whRows[0].id;

    const { rows: epaRows } = await client.query(`SELECT id FROM customers WHERE code = 'EPA' AND warehouse_id = $1`, [warehouseId]);
    const { rows: cofersaRows } = await client.query(`SELECT id FROM customers WHERE code = 'COFERSA' AND warehouse_id = $1`, [warehouseId]);
    if (!epaRows[0] || !cofersaRows[0]) {
      throw new Error('No se encontró EPA/COFERSA bajo el warehouse de CR — verificar que la migración de Fase 1 backfilleó customers.warehouse_id.');
    }

    let count = 0;
    for (const row of EPA_FINAL_CUSTOMERS) {
      await upsertFinalCustomer(client, epaRows[0].id, countryId, row);
      count++;
    }
    for (const row of COFERSA_FINAL_CUSTOMERS) {
      await upsertFinalCustomer(client, cofersaRows[0].id, countryId, row);
      count++;
    }

    console.log(`${execute ? 'EJECUTANDO' : 'DRY RUN'}: ${count} clientes finales (con su punto de entrega y dirección) para EPA (${EPA_FINAL_CUSTOMERS.length}) y COFERSA (${COFERSA_FINAL_CUSTOMERS.length}).`);

    if (execute) {
      await client.query('COMMIT');
      console.log('Aplicado.');
    } else {
      await client.query('ROLLBACK');
      console.log('DRY RUN completado sin errores. Base de datos SIN cambios (ROLLBACK). Reintenta con --execute para aplicar.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('ERROR — ROLLBACK aplicado:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
