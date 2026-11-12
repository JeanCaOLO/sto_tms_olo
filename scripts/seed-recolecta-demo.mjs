// Seed DEMO de una RECOLECTA para probar la app del chofer y el monitor de Tracking de punta a punta.
//
// Arma un viaje "En tránsito" por cada chofer demo (--driver repetible; por defecto los 4 de abajo) con 3 paradas: 2 entregas y 1 recolecta (guía con
// stop_type = 'collection', como la deja Planificación: búsqueda de mercancía ya entregada, no una devolución en sitio).
// Todo queda marcado con route_number `VJ-DEMO-REC-*` y notas "demo-recolecta"; `--clean` lo borra.
//
// Uso (dry-run por defecto):
//   node --env-file=.env.local scripts/seed-recolecta-demo.mjs [--driver correo ...]
//   node --env-file=.env.local scripts/seed-recolecta-demo.mjs --execute
//   node --env-file=.env.local scripts/seed-recolecta-demo.mjs --clean --execute

import pg from 'pg';

const execute = process.argv.includes('--execute');
const clean = process.argv.includes('--clean');
const argEmails = process.argv.flatMap((a, i, all) => (a === '--driver' ? [all[i + 1]] : []));
const DRIVERS = argEmails.length ? argEmails : [
  'chofer.drv-demo-vn-1@demo.tms.local', 'chofer.drv-eflow-11@demo.tms.local',
  'chofer.drv-eflow-12@demo.tms.local', 'chofer.drv-eflow-14@demo.tms.local',
];
const PREFIX = 'VJ-DEMO-REC';
const NOTE = 'demo-recolecta';

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (clean) await cleanUp(client);
    else for (const email of DRIVERS) await seed(client, email);
    await client.query(execute ? 'COMMIT' : 'ROLLBACK');
    console.log(execute ? 'APLICADO.' : 'DRY-RUN (rollback). Usa --execute para aplicar.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function cleanUp(client) {
  // Las paradas demo se reconocen por sus notas; el viaje solo se borra si es uno creado por este script.
  const guides = (await client.query('SELECT id, route_id FROM tbl_dispatch_guides WHERE notes = $1', [NOTE])).rows;
  const guideIds = guides.map((g) => g.id);
  const routeIds = [...new Set(guides.map((g) => g.route_id))];
  if (!guideIds.length) return console.log('Nada que limpiar.');
  const own = (await client.query('SELECT id FROM tbl_routes WHERE id = ANY($1::uuid[]) AND route_number LIKE $2', [routeIds, `${PREFIX}-%`])).rows.map((r) => r.id);
  const steps = [
    ['returns', 'dispatch_guide_id = ANY($1::uuid[])', guideIds],
    ['tracking_evidences', 'dispatch_guide_id = ANY($1::uuid[])', guideIds],
    ['tbl_tracking_events', 'dispatch_guide_id = ANY($1::uuid[])', guideIds],
    ['tbl_tracking_events', 'route_id = ANY($1::uuid[])', own],
    ['tbl_dispatch_guides', 'id = ANY($1::uuid[])', guideIds],
    ['tbl_routes', 'id = ANY($1::uuid[])', own],
    // Pedidos creados por este seed para países sin pedidos propios.
    ['tbl_orders', "notes = $1 AND order_number LIKE 'DEMO-%' AND NOT EXISTS (SELECT 1 FROM tbl_dispatch_guides g WHERE g.order_id = tbl_orders.id)", NOTE],
  ];
  for (const [table, where, ids] of steps) {
    const res = await client.query(`DELETE FROM ${table} WHERE ${where}`, [ids]);
    console.log(`  ${table}: ${res.rowCount} filas`);
  }
  // Viajes abiertos ajenos que solo recibieron paradas demo: se reinician sin borrarlos.
  await client.query('UPDATE tbl_routes SET completed_stops = 0 WHERE id = ANY($1::uuid[])', [routeIds.filter((id) => !own.includes(id))]);
}

async function createDemoOrders(client, driver, store, n) {
  if (!store || store.latitude == null || store.longitude == null) throw new Error('La sede del país no tiene coordenadas: no se pueden crear pedidos demo.');
  const wh = (await client.query('SELECT id, code FROM tbl_warehouses WHERE country_id = $1 ORDER BY created_at LIMIT 1', [driver.country_id])).rows[0];
  const cu = (await client.query('SELECT id FROM tbl_customers WHERE organization_id = $1 AND country_id = $2 ORDER BY created_at LIMIT 1', [driver.organization_id, driver.country_id])).rows[0];
  // `orders` exige sucursal y cliente final del cliente (se reutilizan los existentes, no se crean).
  const br = cu && (await client.query('SELECT id FROM tbl_branches WHERE customer_id = $1 ORDER BY created_at LIMIT 1', [cu.id])).rows[0];
  const fc = cu && (await client.query('SELECT id FROM tbl_final_customers WHERE customer_id = $1 ORDER BY created_at LIMIT 1', [cu.id])).rows[0];
  if (!wh || !cu || !br || !fc) throw new Error('El país del chofer no tiene almacén, cliente, sucursal o cliente final para crear pedidos demo.');
  const stamp = Date.now().toString(36).toUpperCase();
  for (let i = 0; i < n; i++) {
    const lat = Number(store.latitude) + 0.012 * (i + 1), lng = Number(store.longitude) + 0.01 * (i + 1);
    await client.query(
      `INSERT INTO tbl_orders (id, created_at, updated_at, organization_id, customer_id, warehouse_id, branch_id, final_customer_id, order_number, order_date, delivery_date, total_weight, total_volume,
                           delivery_address, delivery_latitude, delivery_longitude, priority, status, wms_status, wms_situation, notes)
       VALUES (gen_random_uuid(), now(), now(), $1, $2, $3, $9, $10, $4, current_date, current_date, 25, 0.1, $5, $6, $7, 1, 'pending', 'DISP', 'GENE', $8)`,
      [driver.organization_id, cu.id, wh.id, `DEMO-${wh.code}-${stamp}-${i + 1}`, `Dirección demo ${wh.code} ${i + 1}`, lat, lng, NOTE, br.id, fc.id]);
  }
}

async function seed(client, DRIVER_EMAIL) {
  const driver = (await client.query(
    `SELECT d.id, d.full_name, d.carrier_id, u.organization_id,
            (SELECT us.country_id FROM tbl_user_scopes us WHERE us.app_user_id = u.id AND us.country_id IS NOT NULL
             ORDER BY us.created_at LIMIT 1) AS country_id
     FROM tbl_drivers d
     JOIN tbl_app_users u ON u.id = d.app_user_id JOIN tbl_auth_credentials c ON c.auth_user_id = u.auth_user_id
     WHERE c.email = $1`, [DRIVER_EMAIL])).rows[0];
  if (!driver) throw new Error(`No hay chofer con el correo ${DRIVER_EMAIL}`);
  const open = (await client.query(
    `SELECT route_number FROM tbl_routes WHERE driver_id = $1 AND lower(status) IN ('en tránsito', 'en transito', 'in_transit', 'active')`,
    [driver.id])).rows;
  let reuse = null;
  if (open.length) {
    // Un viaje abierto SIN paradas (sobra de otras pruebas) se reutiliza; con paradas, no se toca.
    const n = (await client.query('SELECT count(*)::int AS n FROM tbl_dispatch_guides WHERE route_id = (SELECT id FROM tbl_routes WHERE route_number = $1)', [open[0].route_number])).rows[0].n;
    if (n) throw new Error(`${DRIVER_EMAIL} ya tiene el viaje abierto ${open[0].route_number} con paradas: no se toca`);
    reuse = (await client.query('SELECT id, route_number FROM tbl_routes WHERE route_number = $1', [open[0].route_number])).rows[0];
  }

  // Sede, vehículo y transportista del PAÍS del chofer (su scope en tbl_user_scopes): la sede define el país del viaje.
  // Sin país en el scope no se adivina: se aborta en vez de copiar el último viaje de la organización.
  if (!driver.country_id) throw new Error(`${DRIVER_EMAIL} no tiene país en tbl_user_scopes: no se sabe a qué país pertenece su viaje`);
  const store = (await client.query(
    `SELECT id, latitude, longitude FROM tbl_stores WHERE organization_id = $1 AND country_id = $2 AND is_origin = true ORDER BY created_at LIMIT 1`,
    [driver.organization_id, driver.country_id])).rows[0];
  // Vehículo: 1) del transportista del chofer; 2) de un transportista del país; 3) de respaldo, uno que ya hizo viajes
  // con sede de ese país y no está en un viaje abierto.
  const vehicle = (await client.query(
    `SELECT id FROM (
       SELECT v.id, 1 AS rank, v.plate FROM tbl_vehicles v WHERE v.carrier_id = $1
       UNION ALL
       SELECT v.id, 2, v.plate FROM tbl_vehicles v JOIN tbl_carriers ca ON ca.id = v.carrier_id WHERE ca.country_id = $2
       UNION ALL
       SELECT DISTINCT r.vehicle_id, 3, v.plate FROM tbl_routes r JOIN tbl_stores st ON st.id = r.store_id JOIN tbl_vehicles v ON v.id = r.vehicle_id
        WHERE st.country_id = $2
          AND NOT EXISTS (SELECT 1 FROM tbl_routes o WHERE o.vehicle_id = r.vehicle_id AND lower(o.status) IN ('en tránsito', 'en transito', 'in_transit', 'active'))
     ) x ORDER BY rank, plate LIMIT 1`, [driver.carrier_id, driver.country_id])).rows[0];
  const base = store && vehicle ? { store_id: store.id, vehicle_id: vehicle.id, carrier_id: driver.carrier_id } : null;
  // Pedidos geocodificados sin guía del país del chofer. Si el país no tiene 3, se crean pedidos DEMO de ese país
  // (almacén y cliente del país, cerca de su sede) marcados con las notas del seed: `--clean` los borra.
  const pickOrders = async () => (await client.query(
    `SELECT o.id, o.order_number FROM tbl_orders o JOIN tbl_warehouses w ON w.id = o.warehouse_id
     WHERE o.organization_id = $1 AND w.country_id = $2 AND o.delivery_latitude IS NOT NULL AND o.delivery_longitude IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tbl_dispatch_guides g WHERE g.order_id = o.id)
     ORDER BY o.created_at DESC LIMIT 3`, [driver.organization_id, driver.country_id])).rows;
  let orders = await pickOrders();
  if (orders.length < 3) {
    await createDemoOrders(client, driver, store, 3 - orders.length);
    orders = await pickOrders();
  }
  if (!base || orders.length < 3) throw new Error('Faltan sede/vehículo o pedidos del país del chofer.');

  const number = reuse ? reuse.route_number
    : `${PREFIX}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${DRIVER_EMAIL.split('@')[0].slice(-4).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
  const route = reuse ?? (await client.query(
    `INSERT INTO tbl_routes (organization_id, store_id, driver_id, vehicle_id, carrier_id, route_number, route_date,
                         actual_start_time, total_stops, completed_stops, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, current_date, now(), 3, 0, 'En tránsito', $7) RETURNING id`,
    [driver.organization_id, base.store_id, driver.id, base.vehicle_id, base.carrier_id, number, NOTE])).rows[0];

  const guideIds = [];
  for (const [i, order] of orders.entries()) {
    const g = (await client.query(
      `INSERT INTO tbl_dispatch_guides (organization_id, route_id, order_id, guide_number, sequence_number, status,
                                    delivery_status, notes, planned_arrival_time, stop_type)
       VALUES ($1, $2, $3, $4, $5, 'Pendiente', 'pending', $6, now() + make_interval(mins => $7), $8) RETURNING id`,
      [driver.organization_id, route.id, order.id, `${number}-D${i + 1}`, i + 1, NOTE, 30 * (i + 1),
       i === 1 ? 'collection' : 'delivery'])).rows[0];
    guideIds.push(g.id);
  }
  console.log(`Viaje ${number} para ${driver.full_name} (${DRIVER_EMAIL}): paradas 1 y 3 = entrega, parada 2 = recolecta.`);
  console.log('Guías:', guideIds.join(', '));
}

main().catch((err) => { console.error(err.message); process.exit(1); });
