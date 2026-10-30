// Crea viajes de DEMO (plan confirmado de hoy, estado pending) para choferes de prueba concretos.
// Cada viaje: 5 paradas con puntos de entrega geocodificados cercanos a la zona, un pedido demo por parada.
// Dry-run por defecto; --execute aplica. Idempotente por chofer y día (no duplica el viaje del día).
//
//   node --env-file=.env.local scripts/asignar-viajes-demo.mjs
//   node --env-file=.env.local scripts/asignar-viajes-demo.mjs --execute
//   node --env-file=.env.local scripts/asignar-viajes-demo.mjs --execute DRV-EFLOW-14:CR:SanJose DRV-DEMO-VN-1:VN:Caracas

import pg from 'pg';

const execute = process.argv.includes('--execute');
const NOTE = 'demo-viajes';
const STOPS = 5;
const DETOUR = 1.35;

const ZONES = {
  CR: { SanJose: { name: 'San José', lat: 9.9281, lng: -84.0907 }, Alajuela: { name: 'Alajuela', lat: 10.0163, lng: -84.2116 } },
  VN: { Caracas: { name: 'Caracas', lat: 10.4806, lng: -66.9036 } },
};
const DEFAULT_ASSIGN = ['DRV-EFLOW-14:CR:SanJose', 'DRV-EFLOW-12:CR:Alajuela', 'DRV-DEMO-VN-1:VN:Caracas'];
const assigns = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ASSIGN = (assigns.length ? assigns : DEFAULT_ASSIGN).map((s) => {
  const [driver, country, zone] = s.split(':');
  return { driver, country, zone: ZONES[country]?.[zone] };
});

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

const one = async (c, sql, p) => (await c.query(sql, p)).rows[0];
const rad = (x) => (x * Math.PI) / 180;
function km(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * DETOUR;
}
function nearest(origin, points) {
  const left = [...points], out = [];
  let cur = origin;
  while (left.length) {
    let b = 0;
    left.forEach((p, i) => { if (km(cur, p) < km(cur, left[b])) b = i; });
    cur = left.splice(b, 1)[0];
    out.push(cur);
  }
  return out;
}

async function ensurePlan(c, ctx, country, warehouse, today) {
  const note = `${NOTE} ${country.code} ${today}`;
  const found = await one(c, 'SELECT id FROM route_plans WHERE organization_id = $1 AND notes = $2', [ctx.org, note]);
  if (found) return found.id;
  const plan = await one(c,
    `INSERT INTO route_plans (organization_id, country_id, warehouse_id, plan_date, status, created_by, notes)
     VALUES ($1,$2,$3,$4,'confirmed',$5,$6) RETURNING id`, [ctx.org, country.id, warehouse.id, today, ctx.admin, note]);
  console.log(`  plan ${country.code} creado`);
  return plan.id;
}

async function main() {
  const c = await pool.connect();
  const usedPoints = new Set();
  const perCountry = {};
  try {
    await c.query('BEGIN');
    const today = new Date().toISOString().slice(0, 10);
    const ctx = {
      org: (await one(c, 'SELECT id FROM organizations LIMIT 1')).id,
      admin: (await one(c, `SELECT au.id FROM app_users au JOIN roles r ON r.id = au.role_id WHERE r.name = 'SuperAdministrador' ORDER BY au.created_at LIMIT 1`)).id,
    };
    for (const [idx, a] of ASSIGN.entries()) {
      console.log(`${a.driver} (${a.country}):`);
      if (!a.zone) { console.log('  zona desconocida, se omite'); continue; }
      const country = await one(c, 'SELECT id, code FROM countries WHERE code = $1', [a.country]);
      const driver = await one(c, 'SELECT id, full_name FROM drivers WHERE organization_id = $1 AND code = $2', [ctx.org, a.driver]);
      if (!driver) { console.log('  conductor no existe, se omite'); continue; }
      const warehouse = await one(c, 'SELECT id FROM warehouses WHERE country_id = $1 ORDER BY name LIMIT 1', [country.id]);
      const store = await one(c, 'SELECT id, latitude::float AS lat, longitude::float AS lng FROM stores WHERE organization_id = $1 AND is_origin AND country_id = $2 ORDER BY code LIMIT 1', [ctx.org, country.id]);
      if (!store) { console.log('  el país no tiene sede de origen, se omite'); continue; }
      const planId = await ensurePlan(c, ctx, country, warehouse, today);
      if (await one(c, 'SELECT 1 FROM plan_trips WHERE plan_id = $1 AND driver_id = $2', [planId, driver.id])) {
        console.log('  ya tiene viaje demo hoy, se omite'); continue;
      }
      // Vehículo libre: ninguno en un viaje pendiente/en curso.
      const vehicle = await one(c,
        `SELECT v.id, v.plate, v.capacity_weight, v.capacity_volume FROM vehicles v
          LEFT JOIN carriers ca ON ca.id = v.carrier_id
          WHERE v.organization_id = $1
            AND (ca.country_id = $2 OR (v.carrier_id IS NULL AND $3 = 'CR'))
          ORDER BY (SELECT count(*) FROM plan_trips t WHERE t.vehicle_id = v.id AND t.status = 'pending'), v.plate
          OFFSET $4 LIMIT 1`, [ctx.org, country.id, a.country, 0]);
      perCountry[a.country] = (perCountry[a.country] ?? 0) + 1;
      const cand = (await c.query(
        `SELECT dp.id AS dp_id, dp.name, fc.id AS fc_id, fc.customer_id, a.line1, a.latitude::float AS lat, a.longitude::float AS lng
           FROM delivery_points dp JOIN final_customers fc ON fc.id = dp.final_customer_id JOIN addresses a ON a.id = dp.address_id
          WHERE a.country_id = $1 AND dp.active AND a.geocoding_status = 'OK'
            AND a.latitude BETWEEN $2 AND $3 AND a.longitude BETWEEN $4 AND $5`,
        [country.id, a.zone.lat - 0.1, a.zone.lat + 0.1, a.zone.lng - 0.1, a.zone.lng + 0.1])).rows
        .filter((p) => !usedPoints.has(p.dp_id)).sort((x, y) => km(a.zone, x) - km(a.zone, y)).slice(0, STOPS);
      if (cand.length < 2) { console.log('  sin puntos geocodificados suficientes, se omite'); continue; }
      cand.forEach((p) => usedPoints.add(p.dp_id));
      const origin = store.lat != null ? { lat: store.lat, lng: store.lng } : a.zone;
      const ordered = nearest(origin, cand);
      const tag = `${a.country}-${today.replace(/-/g, '')}-${a.driver.split('-').slice(-2).join('')}`;
      const orders = [];
      let weight = 0;
      for (const [i, p] of ordered.entries()) {
        const num = `DEMO-${tag}-${i + 1}`;
        const w = 150 + ((idx * 7 + i * 13) % 6) * 100;
        weight += w;
        let order = await one(c, 'SELECT id FROM orders WHERE organization_id = $1 AND order_number = $2', [ctx.org, num]);
        if (!order) {
          const br = (await one(c, 'SELECT id FROM branches WHERE customer_id = $1 ORDER BY external_code LIMIT 1', [p.customer_id]))
            ?? (await one(c, `INSERT INTO branches (customer_id, external_code, name, status) VALUES ($1,'DEMO','Sucursal demo','active') RETURNING id`, [p.customer_id]));
          order = await one(c,
            `INSERT INTO orders (organization_id, customer_id, order_number, order_date, delivery_date, total_weight, total_volume,
                                 delivery_address, delivery_city, delivery_latitude, delivery_longitude, delivery_zone, status, notes,
                                 delivery_point_id, warehouse_id, branch_id, final_customer_id)
             VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,'assigned',$12,$13,$14,$15,$16) RETURNING id`,
            [ctx.org, p.customer_id, num, today, w, +(w / 200).toFixed(2), p.line1 ?? p.name, a.zone.name, p.lat, p.lng,
              a.zone.name, NOTE, p.dp_id, warehouse.id, br.id, p.fc_id]);
        }
        orders.push({ id: order.id, num, p, w });
      }
      const seq = ((await one(c, 'SELECT COALESCE(MAX(sequence_order),0) AS m FROM plan_trips WHERE plan_id = $1', [planId])).m) + 1;
      const trip = await one(c,
        `INSERT INTO plan_trips (plan_id, vehicle_id, driver_id, delivery_zone, sequence_order, total_weight, total_volume,
                                 vehicle_plate, vehicle_capacity_weight, vehicle_capacity_volume, is_owned, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,'pending') RETURNING id`,
        [planId, vehicle?.id ?? null, driver.id, a.zone.name, seq, weight, +(weight / 200).toFixed(2), vehicle?.plate ?? null,
          vehicle?.capacity_weight ?? null, vehicle?.capacity_volume ?? null]);
      for (const [i, o] of orders.entries()) {
        await c.query(
          `INSERT INTO plan_stops (trip_id, order_id, stop_order, order_number, customer_name, delivery_city, delivery_zone, latitude, longitude, weight, volume)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [trip.id, o.id, i + 1, o.num, o.p.name, a.zone.name, a.zone.name, o.p.lat, o.p.lng, o.w, +(o.w / 200).toFixed(2)]);
      }
      console.log(`  viaje creado: zona ${a.zone.name}, vehículo ${vehicle?.plate ?? '(ninguno)'}, ${orders.length} paradas`);
    }
    if (execute) { await c.query('COMMIT'); console.log('Aplicado.'); }
    else { await c.query('ROLLBACK'); console.log('Dry-run: nada cambió. Usa --execute para aplicar.'); }
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}
main();
