// Seed DEMO (desarrollo) de orders + routes + dispatch_guides para poder
// mostrar la pantalla "Guías de Despacho" (src/pages/guias/) con datos del
// último mes en la presentación de hoy.
//
// IMPORTANTE - esto NO es data real de producción: EFLOW/Softland en vivo
// siguen sin responder (mismo error de login de toda la sesión) y nuestra
// propia tabla dispatch_guides estaba vacía (nada en el pipeline OMS->TMS
// llega hasta crear un viaje/guía todavía). Esto es data de DESARROLLO
// generada con clientes/transportistas/vehículos/conductores/rutas REALES ya
// existentes en Aurora (copiados de EFLOW QA en una sesión anterior), fechas
// distribuidas en los últimos ~27 días, para poder demostrar la pantalla
// funcionando. Cada guía queda marcada en `notes` como dato de desarrollo.
//
// Uso:
//   node --env-file=.env.local scripts/seed-guias-despacho-demo.mjs            (dry-run)
//   node --env-file=.env.local scripts/seed-guias-despacho-demo.mjs --execute  (aplica)

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

const DEV_NOTE = 'Dato de DESARROLLO (demo) - no es un despacho real de producción.';

// Tiendas EPA reales (mismos códigos/ciudades ya usados en seed-wms-expediciones.mjs).
const EPA_STORES = [
  { code: 'T002', name: 'T002 CURRIDABAT', city: 'Curridabat' },
  { code: 'T003', name: 'T003 ESCAZU', city: 'Escazú' },
  { code: 'T004', name: 'T004 BELEN', city: 'Belén' },
  { code: 'T005', name: 'T005 TIBAS', city: 'Tibás' },
  { code: 'T006', name: 'T006 DESAMPARADOS', city: 'Desamparados' },
  { code: 'T008', name: 'T008 CARTAGO', city: 'Cartago' },
];

function addDias(base, dias) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}
function iso(d) {
  return d.toISOString();
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const client = await pool.connect();
  const report = { stores: 0, orders: 0, routes: 0, dispatch_guides: 0 };
  try {
    await client.query('BEGIN');

    const { rows: orgRows } = await client.query('SELECT id FROM organizations LIMIT 1');
    const organizationId = orgRows[0]?.id;
    if (!organizationId) throw new Error('No hay organización - corré primero el seed base.');

    const { rows: crCountry } = await client.query(`SELECT id FROM countries WHERE code = 'CR' LIMIT 1`);
    const countryId = crCountry[0]?.id;
    if (!countryId) throw new Error('No existe país CR.');

    const { rows: whRows } = await client.query(
      `SELECT w.id FROM warehouses w WHERE w.country_id = $1 LIMIT 1`,
      [countryId],
    );
    const warehouseId = whRows[0]?.id;
    if (!warehouseId) throw new Error('No existe warehouse para CR.');

    const { rows: custRows } = await client.query(
      `SELECT id, code FROM customers WHERE warehouse_id = $1 AND code IN ('EPA','COFERSA')`,
      [warehouseId],
    );
    const epaId = custRows.find((c) => c.code === 'EPA')?.id;
    const cofersaId = custRows.find((c) => c.code === 'COFERSA')?.id;
    if (!epaId || !cofersaId) throw new Error('No se encontró EPA/COFERSA.');

    const { rows: routeTypes } = await client.query(`SELECT id, name FROM zones WHERE organization_id = $1`, [organizationId]);
    if (routeTypes.length === 0) throw new Error('No hay zonas (tabla zones, ex route_types).');

    const { rows: drivers } = await client.query(`SELECT id, carrier_id FROM drivers WHERE organization_id = $1`, [organizationId]);
    const { rows: vehicles } = await client.query(`SELECT id FROM vehicles WHERE organization_id = $1`, [organizationId]);
    if (drivers.length === 0 || vehicles.length === 0) throw new Error('Faltan drivers/vehicles.');

    // --- stores: 1 bodega origen + las 6 tiendas EPA reales ---
    const { rows: existingOrigin } = await client.query(
      `SELECT id FROM stores WHERE organization_id = $1 AND code = 'CD-CR' LIMIT 1`,
      [organizationId],
    );
    let origenStoreId = existingOrigin[0]?.id ?? null;
    if (!origenStoreId) {
      const { rows } = await client.query(
        `INSERT INTO stores (organization_id, country_id, warehouse_id, name, code, address, city, status, store_type, is_origin)
         VALUES ($1,$2,$3,'Bodega Central OLO CR','CD-CR','Zona Industrial, La Uruca','San José','active','warehouse',true)
         RETURNING id`,
        [organizationId, countryId, warehouseId],
      );
      origenStoreId = rows[0].id;
      report.stores++;
    }

    const epaStoreIdByCode = new Map();
    for (const s of EPA_STORES) {
      const { rows: existing } = await client.query(
        `SELECT id FROM stores WHERE organization_id = $1 AND code = $2 LIMIT 1`,
        [organizationId, s.code],
      );
      if (existing[0]) {
        epaStoreIdByCode.set(s.code, existing[0].id);
        continue;
      }
      const { rows } = await client.query(
        `INSERT INTO stores (organization_id, country_id, warehouse_id, name, code, address, city, status, store_type, is_origin)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active','store',false)
         RETURNING id`,
        [organizationId, countryId, warehouseId, s.name, s.code, s.city, s.city],
      );
      epaStoreIdByCode.set(s.code, rows[0].id);
      report.stores++;
    }

    // --- routes + orders + dispatch_guides, distribuidos en los últimos 27 días ---
    const hoy = new Date();
    const N_ROUTES = 18;

    for (let i = 0; i < N_ROUTES; i++) {
      const diasAtras = Math.round((i / (N_ROUTES - 1)) * 27); // 0..27 días atrás, distribuido
      const fecha = addDias(hoy, -diasAtras);
      const routeType = routeTypes[i % routeTypes.length];
      const driver = drivers[i % drivers.length];
      const vehicle = vehicles[i % vehicles.length];

      const esPasada = diasAtras >= 2;
      const esHoy = diasAtras === 0;
      const routeStatus = esPasada ? 'completada' : esHoy ? 'en_ruta' : 'en_ruta';

      const plannedStart = new Date(fecha); plannedStart.setUTCHours(7, 0, 0, 0);
      const plannedEnd = new Date(fecha); plannedEnd.setUTCHours(16, 0, 0, 0);
      const actualStart = esPasada || !esHoy ? new Date(plannedStart.getTime() + 12 * 60000) : null;
      const actualEnd = esPasada ? new Date(plannedEnd.getTime() + 25 * 60000) : null;

      const nOrders = 2 + (i % 3); // 2-4 pedidos por ruta
      const orderRows = [];
      for (let j = 0; j < nOrders; j++) {
        const esEpa = (i + j) % 2 === 0;
        const customerId = esEpa ? epaId : cofersaId;
        const store = esEpa ? EPA_STORES[(i + j) % EPA_STORES.length] : null;
        const storeId = esEpa ? epaStoreIdByCode.get(store.code) : origenStoreId;
        const deliveryAddress = esEpa
          ? `${store.name}, ${store.city}`
          : `Cliente Cofersa #${1000 + i * 10 + j}, San José`;
        const orderNumber = `DEMO-${isoDate(fecha).replace(/-/g, '')}-${i}${j}`;

        const { rows } = await client.query(
          `INSERT INTO orders (
             organization_id, store_id, customer_id, order_number, order_date, delivery_date,
             total_weight, total_volume, total_items, total_amount,
             delivery_address, delivery_city, delivery_zone, priority, status, notes, route_type_id
           ) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,'2','entregado',$13,$14)
           RETURNING id`,
          [
            organizationId, storeId, customerId, orderNumber, isoDate(fecha),
            80 + (j * 35), 0.6 + j * 0.3, 3 + j * 2, 45000 + j * 18000,
            deliveryAddress, esEpa ? store.city : 'San José', routeType.name,
            DEV_NOTE, routeType.id,
          ],
        );
        orderRows.push({ id: rows[0].id, deliveryAddress, storeId, esEpa, storeCode: esEpa ? store.code : null });
        report.orders++;
      }

      const { rows: routeRows } = await client.query(
        `INSERT INTO routes (
           organization_id, store_id, driver_id, vehicle_id, carrier_id, route_number, route_date,
           planned_start_time, actual_start_time, planned_end_time, actual_end_time,
           total_distance, total_stops, completed_stops, total_weight, total_volume,
           status, notes, route_type_id, capacity_percentage
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          organizationId, origenStoreId, driver.id, vehicle.id, driver.carrier_id, `RT-DEMO-${i + 1}`, isoDate(fecha),
          iso(plannedStart), actualStart ? iso(actualStart) : null, iso(plannedEnd), actualEnd ? iso(actualEnd) : null,
          40 + nOrders * 12, nOrders, esPasada ? nOrders : Math.max(0, nOrders - 1), 200 + nOrders * 50, 2 + nOrders * 0.5,
          routeStatus, DEV_NOTE, routeType.id, Math.min(100, 55 + nOrders * 10),
        ],
      );
      const routeId = routeRows[0].id;
      report.routes++;

      for (let j = 0; j < orderRows.length; j++) {
        const o = orderRows[j];
        const plannedArrival = new Date(plannedStart.getTime() + (j + 1) * 45 * 60000);
        const esUltimaParada = j === orderRows.length - 1;
        const paradaCompletada = esPasada || (!esHoy && !esUltimaParada);
        const deliveryStatus = esPasada ? 'delivered' : paradaCompletada ? 'delivered' : esHoy ? 'pending' : 'in_transit';
        const guideStatus = deliveryStatus === 'delivered' ? 'completada' : deliveryStatus === 'in_transit' ? 'en_ruta' : 'pendiente';

        await client.query(
          `INSERT INTO dispatch_guides (
             organization_id, route_id, order_id, guide_number, sequence_number,
             planned_arrival_time, actual_arrival_time, planned_departure_time, actual_departure_time,
             status, delivery_status, recipient_name, notes
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            organizationId, routeId, o.id, `GD-CR-${isoDate(fecha).replace(/-/g, '')}-${i + 1}-${j + 1}`, j + 1,
            iso(plannedArrival), paradaCompletada ? iso(new Date(plannedArrival.getTime() + 8 * 60000)) : null,
            iso(new Date(plannedArrival.getTime() + 20 * 60000)),
            paradaCompletada ? iso(new Date(plannedArrival.getTime() + 28 * 60000)) : null,
            guideStatus, deliveryStatus,
            o.esEpa ? `Encargado(a) ${o.storeCode}` : 'Recepción Cofersa',
            DEV_NOTE,
          ],
        );
        report.dispatch_guides++;
      }
    }

    console.log(`${execute ? 'EJECUTANDO' : 'DRY RUN'}:`, report);

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
