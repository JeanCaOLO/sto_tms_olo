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
  const guides = (await client.query('SELECT id, route_id FROM dispatch_guides WHERE notes = $1', [NOTE])).rows;
  const guideIds = guides.map((g) => g.id);
  const routeIds = [...new Set(guides.map((g) => g.route_id))];
  if (!guideIds.length) return console.log('Nada que limpiar.');
  const own = (await client.query('SELECT id FROM routes WHERE id = ANY($1::uuid[]) AND route_number LIKE $2', [routeIds, `${PREFIX}-%`])).rows.map((r) => r.id);
  const steps = [
    ['returns', 'dispatch_guide_id = ANY($1::uuid[])', guideIds],
    ['tracking_evidences', 'dispatch_guide_id = ANY($1::uuid[])', guideIds],
    ['tracking_events', 'dispatch_guide_id = ANY($1::uuid[])', guideIds],
    ['tracking_events', 'route_id = ANY($1::uuid[])', own],
    ['dispatch_guides', 'id = ANY($1::uuid[])', guideIds],
    ['routes', 'id = ANY($1::uuid[])', own],
  ];
  for (const [table, where, ids] of steps) {
    const res = await client.query(`DELETE FROM ${table} WHERE ${where}`, [ids]);
    console.log(`  ${table}: ${res.rowCount} filas`);
  }
  // Viajes abiertos ajenos que solo recibieron paradas demo: se reinician sin borrarlos.
  await client.query('UPDATE routes SET completed_stops = 0 WHERE id = ANY($1::uuid[])', [routeIds.filter((id) => !own.includes(id))]);
}

async function seed(client, DRIVER_EMAIL) {
  const driver = (await client.query(
    `SELECT d.id, d.full_name, u.organization_id FROM drivers d
     JOIN app_users u ON u.id = d.app_user_id JOIN auth_credentials c ON c.auth_user_id = u.auth_user_id
     WHERE c.email = $1`, [DRIVER_EMAIL])).rows[0];
  if (!driver) throw new Error(`No hay chofer con el correo ${DRIVER_EMAIL}`);
  const open = (await client.query(
    `SELECT route_number FROM routes WHERE driver_id = $1 AND lower(status) IN ('en tránsito', 'en transito', 'in_transit', 'active')`,
    [driver.id])).rows;
  let reuse = null;
  if (open.length) {
    // Un viaje abierto SIN paradas (sobra de otras pruebas) se reutiliza; con paradas, no se toca.
    const n = (await client.query('SELECT count(*)::int AS n FROM dispatch_guides WHERE route_id = (SELECT id FROM routes WHERE route_number = $1)', [open[0].route_number])).rows[0].n;
    if (n) throw new Error(`${DRIVER_EMAIL} ya tiene el viaje abierto ${open[0].route_number} con paradas: no se toca`);
    reuse = (await client.query('SELECT id, route_number FROM routes WHERE route_number = $1', [open[0].route_number])).rows[0];
  }

  // Sede, vehículo y transportista: los de cualquier viaje existente de la organización.
  const base = (await client.query(
    `SELECT store_id, vehicle_id, carrier_id FROM routes
     WHERE organization_id = $1 AND store_id IS NOT NULL AND vehicle_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [driver.organization_id])).rows[0];
  // Pedidos geocodificados que aún no tienen guía.
  const orders = (await client.query(
    `SELECT o.id, o.order_number FROM orders o
     WHERE o.organization_id = $1 AND o.delivery_latitude IS NOT NULL AND o.delivery_longitude IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dispatch_guides g WHERE g.order_id = o.id)
     ORDER BY o.created_at DESC LIMIT 3`, [driver.organization_id])).rows;
  if (!base || orders.length < 3) throw new Error('Faltan sede/vehículo o 3 pedidos geocodificados sin guía.');

  const number = reuse ? reuse.route_number
    : `${PREFIX}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${DRIVER_EMAIL.split('@')[0].slice(-4).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
  const route = reuse ?? (await client.query(
    `INSERT INTO routes (organization_id, store_id, driver_id, vehicle_id, carrier_id, route_number, route_date,
                         actual_start_time, total_stops, completed_stops, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, current_date, now(), 3, 0, 'En tránsito', $7) RETURNING id`,
    [driver.organization_id, base.store_id, driver.id, base.vehicle_id, base.carrier_id, number, NOTE])).rows[0];

  const guideIds = [];
  for (const [i, order] of orders.entries()) {
    const g = (await client.query(
      `INSERT INTO dispatch_guides (organization_id, route_id, order_id, guide_number, sequence_number, status,
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
