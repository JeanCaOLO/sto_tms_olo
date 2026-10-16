// Seed DEMO (sandbox) para probar el monitor de Tracking en Costa Rica y Venezuela.
//
// Qué hace (todo idempotente, marcado en notas como "demo-tracking"):
//  CR  - reutiliza los planes confirmados y sus viajes; asigna conductor a los viajes sin conductor
//        y crea usuario (rol Chofer) a 3 conductores existentes.
//  VN  - no tenía sede de origen, transportista, conductores ni vehículos: los crea (1 sede, 1
//        transportista, 3 vehículos, 3 conductores con usuario) y arma 1 plan confirmado de hoy con
//        3 viajes (Caracas, Valencia, Maracay) usando puntos de entrega YA geocodificados de VN y
//        un pedido demo por parada.
// Los viajes quedan "pendientes de iniciar": se inician desde Tracking (botón de pruebas) o con el
// puente del backend; luego `scripts/simular-posiciones.mjs` mueve el camión.
//
// Requiere sql/41_tracking_chofer_usuario.sql aplicada y la variable DEMO_DRIVER_PASSWORD
// (clave de los usuarios chofer de demo; no se imprime).
//
// Uso:
//   DEMO_DRIVER_PASSWORD=... node --env-file=.env.local scripts/seed-tracking-demo.mjs            (dry-run)
//   DEMO_DRIVER_PASSWORD=... node --env-file=.env.local scripts/seed-tracking-demo.mjs --execute

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const execute = process.argv.includes('--execute');
const DEMO_PASSWORD = process.env.DEMO_DRIVER_PASSWORD;
const NOTE = 'demo-tracking';
const DEMO_EMAIL_DOMAIN = 'demo.tms.local';

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

// Zonas de Venezuela: centro aproximado para elegir puntos de entrega cercanos entre sí.
const VN_ZONES = [
  { name: 'Caracas', lat: 10.4806, lng: -66.9036 },
  { name: 'Valencia', lat: 10.162, lng: -68.0077 },
  { name: 'Maracay', lat: 10.2469, lng: -67.5958 },
];
const VN_ORIGIN = { code: 'CD-VN', name: 'Bodega Central OLO VN', city: 'Caracas', address: 'Zona industrial, Caracas', lat: 10.4575, lng: -66.9419 };
const STOPS_PER_TRIP = 5;
const DETOUR = 1.35;

const report = {};
const bump = (key, n = 1) => { report[key] = (report[key] ?? 0) + n; };

function haversineKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * DETOUR;
}

function nearestNeighbor(origin, points) {
  const left = [...points];
  const out = [];
  let cur = origin;
  while (left.length) {
    let best = 0;
    left.forEach((p, i) => { if (haversineKm(cur, p) < haversineKm(cur, left[best])) best = i; });
    const [next] = left.splice(best, 1);
    out.push(next);
    cur = next;
  }
  return out;
}

async function one(client, sql, params) {
  const { rows } = await client.query(sql, params);
  return rows[0];
}

async function ensureDriverUser(client, ctx, driver, email, roleId, countryId) {
  const existing = await one(client, 'SELECT app_user_id FROM drivers WHERE id = $1', [driver.id]);
  if (existing?.app_user_id) return existing.app_user_id;
  const taken = await one(client, 'SELECT id FROM app_users WHERE lower(email) = $1', [email]);
  let appUserId = taken?.id;
  if (!appUserId) {
    const authUserId = randomUUID();
    await client.query('INSERT INTO auth_credentials (auth_user_id, email, password_hash) VALUES ($1, $2, $3)',
      [authUserId, email, ctx.passwordHash]);
    const user = await one(client,
      `INSERT INTO app_users (auth_user_id, organization_id, full_name, email, role_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
      [authUserId, ctx.organizationId, driver.full_name, email, roleId]);
    appUserId = user.id;
    await client.query('INSERT INTO user_scopes (app_user_id, role_id, country_id) VALUES ($1, $2, $3)',
      [appUserId, roleId, countryId]);
    bump('usuarios chofer creados');
  }
  await client.query('UPDATE drivers SET app_user_id = $1 WHERE id = $2', [appUserId, driver.id]);
  bump('conductores vinculados a usuario');
  return appUserId;
}

async function seedCostaRica(client, ctx) {
  const country = await one(client, `SELECT id FROM countries WHERE code = 'CR'`);
  const drivers = (await client.query(
    `SELECT d.id, d.code, d.full_name FROM drivers d JOIN carriers c ON c.id = d.carrier_id
      WHERE c.country_id = $1 AND d.status = $2 ORDER BY d.code LIMIT 3`,
    [country.id, ctx.driverStatus])).rows;
  for (const d of drivers) {
    await ensureDriverUser(client, ctx, d, `chofer.${d.code.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`, ctx.choferRoleId, country.id);
  }
  if (!drivers.length) return;
  const trips = (await client.query(
    `SELECT t.id FROM plan_trips t JOIN route_plans p ON p.id = t.plan_id
      WHERE p.country_id = $1 AND p.status = 'confirmed' AND t.status = 'pending' AND t.driver_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM routes r WHERE r.plan_trip_id = t.id)
      ORDER BY t.id`, [country.id])).rows;
  for (const [i, trip] of trips.entries()) {
    await client.query('UPDATE plan_trips SET driver_id = $1 WHERE id = $2', [drivers[i % drivers.length].id, trip.id]);
    bump('CR viajes con conductor asignado');
  }
}

async function ensureVnBase(client, ctx, country, warehouse) {
  let store = await one(client, 'SELECT id FROM stores WHERE organization_id = $1 AND code = $2', [ctx.organizationId, VN_ORIGIN.code]);
  if (!store) {
    store = await one(client,
      `INSERT INTO stores (organization_id, country_id, warehouse_id, name, code, address, city, latitude, longitude, status, is_origin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING id`,
      [ctx.organizationId, country.id, warehouse.id, VN_ORIGIN.name, VN_ORIGIN.code, VN_ORIGIN.address, VN_ORIGIN.city,
        VN_ORIGIN.lat, VN_ORIGIN.lng, ctx.storeStatus]);
    bump('VN sede de origen creada');
  }
  let carrier = await one(client, 'SELECT id FROM carriers WHERE organization_id = $1 AND code = $2', [ctx.organizationId, 'DEMO-VN-TRP']);
  if (!carrier) {
    carrier = await one(client,
      `INSERT INTO carriers (organization_id, country_id, code, name, status) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [ctx.organizationId, country.id, 'DEMO-VN-TRP', 'Transporte Demo Venezuela', ctx.carrierStatus]);
    bump('VN transportista creado');
  }
  const people = [
    { n: 1, name: 'Carlos Pérez', plate: 'DEMO-VN-01', phone: '+58 412 000 0001' },
    { n: 2, name: 'María González', plate: 'DEMO-VN-02', phone: '+58 412 000 0002' },
    { n: 3, name: 'José Rodríguez', plate: 'DEMO-VN-03', phone: '+58 412 000 0003' },
  ];
  const fleet = [];
  for (const p of people) {
    let vehicle = await one(client, 'SELECT id, plate, capacity_weight, capacity_volume FROM vehicles WHERE organization_id = $1 AND plate = $2', [ctx.organizationId, p.plate]);
    if (!vehicle) {
      vehicle = await one(client,
        `INSERT INTO vehicles (organization_id, carrier_id, plate, vehicle_type, capacity_weight, capacity_volume, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, plate, capacity_weight, capacity_volume`,
        [ctx.organizationId, carrier.id, p.plate, 'Camión', 5000, 30, ctx.vehicleStatus]);
      bump('VN vehículos creados');
    }
    const code = `DRV-DEMO-VN-${p.n}`;
    let driver = await one(client, 'SELECT id, code, full_name FROM drivers WHERE organization_id = $1 AND code = $2', [ctx.organizationId, code]);
    if (!driver) {
      driver = await one(client,
        `INSERT INTO drivers (organization_id, carrier_id, code, full_name, license_number, phone, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, code, full_name`,
        [ctx.organizationId, carrier.id, code, p.name, `LIC-VN-${p.n}`, p.phone, ctx.driverStatus]);
      bump('VN conductores creados');
    }
    await ensureDriverUser(client, ctx, driver, `chofer.${code.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`, ctx.choferRoleId, country.id);
    fleet.push({ vehicle, driver });
  }
  return { store, fleet };
}

async function ensureBranch(client, customerId) {
  const found = await one(client, 'SELECT id FROM branches WHERE customer_id = $1 ORDER BY external_code LIMIT 1', [customerId]);
  if (found) return found.id;
  const created = await one(client,
    `INSERT INTO branches (customer_id, external_code, name, status) VALUES ($1, 'DEMO', 'Sucursal demo', 'active') RETURNING id`, [customerId]);
  bump('VN sucursales demo creadas');
  return created.id;
}

async function seedVenezuela(client, ctx) {
  const country = await one(client, `SELECT id FROM countries WHERE code = 'VN'`);
  const warehouse = await one(client, `SELECT id FROM warehouses WHERE country_id = $1 AND name = 'OLO Venezuela'`, [country.id])
    ?? await one(client, 'SELECT id FROM warehouses WHERE country_id = $1 LIMIT 1', [country.id]);
  const { store, fleet } = await ensureVnBase(client, ctx, country, warehouse);

  const today = new Date().toISOString().slice(0, 10);
  const planNote = `${NOTE} VN ${today}`;
  if (await one(client, 'SELECT id FROM route_plans WHERE organization_id = $1 AND notes = $2', [ctx.organizationId, planNote])) {
    console.log('VN: el plan demo de hoy ya existe; no se crea otro.');
    return;
  }
  const plan = await one(client,
    `INSERT INTO route_plans (organization_id, country_id, warehouse_id, plan_date, status, created_by, notes)
     VALUES ($1,$2,$3,$4,'confirmed',$5,$6) RETURNING id`,
    [ctx.organizationId, country.id, warehouse.id, today, ctx.adminUserId, planNote]);
  bump('VN planes creados');

  const usedPoints = new Set();
  for (const [zi, zone] of VN_ZONES.entries()) {
    const candidates = (await client.query(
      `SELECT dp.id AS dp_id, dp.name, fc.id AS fc_id, fc.customer_id, a.line1, a.latitude::float AS lat, a.longitude::float AS lng
         FROM delivery_points dp
         JOIN final_customers fc ON fc.id = dp.final_customer_id
         JOIN addresses a ON a.id = dp.address_id
        WHERE a.country_id = $1 AND dp.active AND a.geocoding_status = 'OK'
          AND a.latitude BETWEEN $2 AND $3 AND a.longitude BETWEEN $4 AND $5`,
      [country.id, zone.lat - 0.12, zone.lat + 0.12, zone.lng - 0.12, zone.lng + 0.12])).rows
      .filter((p) => !usedPoints.has(p.dp_id))
      .sort((a, b) => haversineKm(zone, a) - haversineKm(zone, b))
      .slice(0, STOPS_PER_TRIP);
    if (candidates.length < 2) { console.log(`VN ${zone.name}: sin puntos geocodificados suficientes; se omite.`); continue; }
    candidates.forEach((p) => usedPoints.add(p.dp_id));
    const ordered = nearestNeighbor({ lat: VN_ORIGIN.lat, lng: VN_ORIGIN.lng }, candidates);
    const { vehicle, driver } = fleet[zi];

    const orders = [];
    let weight = 0;
    for (const [i, p] of ordered.entries()) {
      const orderNumber = `DEMO-VN-${today.replace(/-/g, '')}-${zi + 1}${i + 1}`;
      const w = 150 + ((zi * 7 + i * 13) % 6) * 100;
      weight += w;
      let order = await one(client, 'SELECT id FROM orders WHERE organization_id = $1 AND order_number = $2', [ctx.organizationId, orderNumber]);
      if (!order) {
        const branchId = await ensureBranch(client, p.customer_id);
        order = await one(client,
          `INSERT INTO orders (organization_id, store_id, customer_id, order_number, order_date, delivery_date, total_weight,
                               total_volume, delivery_address, delivery_city, delivery_latitude, delivery_longitude, delivery_zone,
                               status, notes, delivery_point_id, warehouse_id, branch_id, final_customer_id)
           VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,'assigned',$13,$14,$15,$16,$17) RETURNING id`,
          [ctx.organizationId, store.id, p.customer_id, orderNumber, today, w, +(w / 200).toFixed(2), p.line1 ?? p.name, zone.name,
            p.lat, p.lng, zone.name, NOTE, p.dp_id, warehouse.id, branchId, p.fc_id]);
        bump('VN pedidos creados');
      }
      orders.push({ id: order.id, number: orderNumber, p, w });
    }
    const trip = await one(client,
      `INSERT INTO plan_trips (plan_id, vehicle_id, driver_id, delivery_zone, sequence_order, total_weight, total_volume,
                               vehicle_plate, vehicle_capacity_weight, vehicle_capacity_volume, is_owned, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,'pending') RETURNING id`,
      [plan.id, vehicle.id, driver.id, zone.name, zi + 1, weight, +(weight / 200).toFixed(2), vehicle.plate,
        vehicle.capacity_weight, vehicle.capacity_volume]);
    bump('VN viajes creados');
    for (const [i, o] of orders.entries()) {
      await client.query(
        `INSERT INTO plan_stops (trip_id, order_id, stop_order, order_number, customer_name, delivery_city, delivery_zone, latitude, longitude, weight, volume)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [trip.id, o.id, i + 1, o.number, o.p.name, zone.name, zone.name, o.p.lat, o.p.lng, o.w, +(o.w / 200).toFixed(2)]);
      bump('VN paradas creadas');
    }
  }
}

async function main() {
  if (!DEMO_PASSWORD) throw new Error('Define DEMO_DRIVER_PASSWORD (clave de los usuarios chofer de demo).');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hasLink = await one(client, `SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'app_user_id'`);
    if (!hasLink) throw new Error('Falta sql/41_tracking_chofer_usuario.sql (drivers.app_user_id). Aplícala primero.');

    const ctx = {
      organizationId: (await one(client, 'SELECT id FROM organizations LIMIT 1')).id,
      choferRoleId: (await one(client, `SELECT id FROM roles WHERE name = 'Chofer'`)).id,
      adminUserId: (await one(client, `SELECT au.id FROM app_users au JOIN roles r ON r.id = au.role_id WHERE r.name = 'SuperAdministrador' ORDER BY au.created_at LIMIT 1`)).id,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      // Se copian los valores de estado ya usados en cada tabla (evita adivinar el vocabulario del CHECK).
      driverStatus: (await one(client, 'SELECT status FROM drivers WHERE status IS NOT NULL LIMIT 1')).status,
      vehicleStatus: (await one(client, 'SELECT status FROM vehicles WHERE status IS NOT NULL LIMIT 1')).status,
      carrierStatus: (await one(client, 'SELECT status FROM carriers WHERE status IS NOT NULL LIMIT 1')).status,
      storeStatus: (await one(client, 'SELECT status FROM stores WHERE status IS NOT NULL LIMIT 1')).status,
    };
    await seedCostaRica(client, ctx);
    await seedVenezuela(client, ctx);
    console.table(report);
    if (execute) { await client.query('COMMIT'); console.log('Aplicado.'); }
    else { await client.query('ROLLBACK'); console.log('Dry-run: nada cambió. Usa --execute para aplicar.'); }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
