// Disparador automático de viajes — EJECUCIÓN REAL (no vista previa).
//
// Corre el motor de Planificación (plan-automatico.ts → planificarDia, ver
// scripts/lib/plan-viajes.mjs) contra los pedidos alistados REALES con entrega
// en la fecha objetivo (wms_expediciones, situacion='GENE', numero_viaje_wmh
// IS NULL, fecha_planificada = fecha; por defecto mañana) y la flota REAL
// disponible ese día (excluye choferes/vehículos ya ocupados en una ruta de
// esa fecha que no esté anulada). Por cada viaje propuesto:
//   1. Crea un `orders` por pedido (still-pending fields marcados como tales:
//      sin peso/volumen/dirección reales - mismo gap documentado en
//      pedidos-alistados-api.ts).
//   2. Crea la `route` (viaje), con el conductor/vehículo/transportista
//      asignado y el route_type resuelto por código de ruta si existe en el
//      catálogo.
//   3. Crea una `dispatch_guide` por pedido (parada), sin horario planificado
//      todavía (el ruteo/ETA real es una fase posterior).
//   4. Marca wms_expediciones.numero_viaje_wmh = route_number, para que esos
//      pedidos no se vuelvan a proponer en la próxima corrida.
//
// Los pedidos SIN camión disponible NO crean nada - quedan para la próxima
// corrida (cuando se libere flota). Nunca se crea un viaje sin transporte.
//
// Uso:
//   node --env-file=.env.local scripts/generar-viajes-automatico.mjs                      (dry-run, mañana)
//   node --env-file=.env.local scripts/generar-viajes-automatico.mjs --fecha 2026-09-25  (dry-run, otra fecha)
//   node --env-file=.env.local scripts/generar-viajes-automatico.mjs --execute            (aplica)

import pg from 'pg';
import { armarFlota, fechaObjetivo, loadEngine, loadPedidosAlistados, propuestasDelDia } from './lib/plan-viajes.mjs';

const execute = process.argv.includes('--execute');

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { planificarDia, calcularPrioridad } = await loadEngine();
  const fechaEntrega = fechaObjetivo(process.argv);

  const client = await pool.connect();
  const reporte = { viajesCreados: 0, ordenesCreadas: 0, guiasCreadas: 0, pedidosMarcados: 0, sinFlota: 0, sinRouteType: [] };
  try {
    await client.query('BEGIN');
    // Los viajes se crean para el día de la entrega.
    const hoyIso = fechaEntrega;

    const { rows: orgRows } = await client.query('SELECT id FROM organizations LIMIT 1');
    const organizationId = orgRows[0]?.id;
    const { rows: crCountry } = await client.query(`SELECT id FROM countries WHERE code = 'CR' LIMIT 1`);
    const countryId = crCountry[0]?.id;
    const { rows: whRows } = await client.query(`SELECT id FROM warehouses WHERE country_id = $1 LIMIT 1`, [countryId]);
    const warehouseId = whRows[0]?.id;
    if (!organizationId || !countryId || !warehouseId) throw new Error('Falta organización/país/warehouse base.');

    const { rows: custRows } = await client.query(
      `SELECT id, code FROM customers WHERE warehouse_id = $1 AND code IN ('EPA','COFERSA')`,
      [warehouseId],
    );
    const epaCustomerId = custRows.find((c) => c.code === 'EPA')?.id;
    const cofersaCustomerId = custRows.find((c) => c.code === 'COFERSA')?.id;

    const { rows: origenRows } = await client.query(
      `SELECT id FROM stores WHERE organization_id = $1 AND code = 'CD-CR' LIMIT 1`,
      [organizationId],
    );
    const origenStoreId = origenRows[0]?.id ?? null;
    const { rows: epaStoreRows } = await client.query(
      `SELECT id, code FROM stores WHERE organization_id = $1 AND is_origin = false`,
      [organizationId],
    );
    const epaStoreIdByCode = new Map(epaStoreRows.map((s) => [s.code, s.id]));

    // Zonas (antes route_types, sql/09): el código de la zona es el código de ruta del WMS.
    const { rows: zones } = await client.query(`SELECT id, code, name FROM zones WHERE organization_id = $1`, [organizationId]);

    // --- pedidos alistados por el OMS con entrega en la fecha, todavía SIN viaje ---
    const pedidosAlistados = await loadPedidosAlistados(client, fechaEntrega, calcularPrioridad);

    // --- flota disponible HOY: excluye choferes/vehículos ya en una ruta de hoy sin anular ---
    const { rows: ocupadosHoy } = await client.query(
      `SELECT driver_id, vehicle_id FROM routes WHERE route_date = $1 AND status <> 'anulado'`,
      [hoyIso],
    );
    const driversOcupados = new Set(ocupadosHoy.map((r) => r.driver_id).filter(Boolean));
    const vehiclesOcupados = new Set(ocupadosHoy.map((r) => r.vehicle_id).filter(Boolean));

    const { rows: drivers } = await client.query(
      `SELECT d.id AS conductor_id, d.full_name, d.carrier_id, c.is_flota_propia, c.name AS carrier_name
       FROM drivers d JOIN carriers c ON c.id = d.carrier_id
       WHERE d.organization_id = $1 AND d.id != ALL($2::uuid[])`,
      [organizationId, [...driversOcupados]],
    );
    const { rows: vehicles } = await client.query(
      `SELECT id, plate, vehicle_type, capacity_weight, capacity_volume FROM vehicles
       WHERE organization_id = $1 AND id != ALL($2::uuid[]) ORDER BY id`,
      [organizationId, [...vehiclesOcupados]],
    );
    // Parejas conductor-vehículo sin repetir vehículo (ver armarFlota).
    const slotsDisponibles = armarFlota(drivers, vehicles);

    const { propuestas, sinFlota } = propuestasDelDia(planificarDia, pedidosAlistados, slotsDisponibles);
    reporte.sinFlota = sinFlota.length;
    const motivo = `plan automático, entrega ${fechaEntrega}`;

    let contador = 0;
    for (const propuesta of propuestas) {
      contador++;
      const slot = propuesta.slot;

      const routeType = zones.find((z) => z.code === propuesta.ruta || z.name === propuesta.ruta);
      if (!routeType) reporte.sinRouteType.push(propuesta.ruta);

      const orderIds = [];
      for (const pedido of propuesta.pedidos) {
        const esEpa = pedido.id_compania === '0029';
        const customerId = esEpa ? epaCustomerId : cofersaCustomerId;
        const storeId = esEpa ? (epaStoreIdByCode.get(pedido.cliente_code) ?? origenStoreId) : origenStoreId;
        const { rows } = await client.query(
          `INSERT INTO orders (
             organization_id, store_id, customer_id, order_number, order_date, delivery_date,
             total_weight, total_volume, total_items, total_amount,
             delivery_address, delivery_city, delivery_zone, priority, status, notes, route_type_id
           ) VALUES ($1,$2,$3,$4,$5,$11,0,0,$6,0,'(pendiente - sin dirección de línea real todavía)',NULL,$7,$8,'assigned',$9,$10)
           RETURNING id`,
          [
            organizationId, storeId, customerId, pedido.order_number, pedido.order_date || hoyIso,
            pedido.cant_lineas, propuesta.ruta, String(pedido.tier),
            `Generado automáticamente por el disparador de viajes (plan-automatico.ts) - motivo: ${motivo}.`,
            routeType?.id ?? null, pedido.delivery_date ?? fechaEntrega,
          ],
        );
        orderIds.push(rows[0].id);
        reporte.ordenesCreadas++;
      }

      const routeNumber = `RT-AUTO-${hoyIso.replace(/-/g, '')}-${contador}`;
      const { rows: routeRows } = await client.query(
        `INSERT INTO routes (
           organization_id, store_id, driver_id, vehicle_id, carrier_id, route_number, route_date,
           total_stops, completed_stops, status, notes, route_type_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'planificada',$9,$10)
         RETURNING id`,
        [
          organizationId, origenStoreId, slot.conductorId, slot.vehiculo.id, slot._carrierId, routeNumber, hoyIso,
          propuesta.pedidos.length,
          `Generado automáticamente por el disparador de viajes - motivo: ${motivo}.` +
            (routeType ? '' : ` (ruta "${propuesta.ruta}" sin zona en el catálogo - queda sin asignar)`),
          routeType?.id ?? null,
        ],
      );
      const routeId = routeRows[0].id;
      reporte.viajesCreados++;

      for (let i = 0; i < propuesta.pedidos.length; i++) {
        await client.query(
          `INSERT INTO dispatch_guides (organization_id, route_id, order_id, guide_number, sequence_number, status, delivery_status, notes)
           VALUES ($1,$2,$3,$4,$5,'pendiente','pending',$6)`,
          [
            organizationId, routeId, orderIds[i], `${routeNumber}-${i + 1}`, i + 1,
            'Generada automáticamente al crear el viaje - sin horario planificado todavía (ruteo/ETA es una fase posterior).',
          ],
        );
        reporte.guiasCreadas++;
      }

      const idsAlistados = propuesta.pedidos.map((p) => p.id);
      await client.query(`UPDATE wms_expediciones SET numero_viaje_wmh = $1, updated_at = now() WHERE id = ANY($2::uuid[])`, [routeNumber, idsAlistados]);
      reporte.pedidosMarcados += idsAlistados.length;
    }

    console.log(`${execute ? 'EJECUTANDO' : 'DRY RUN'}:`, reporte);
    console.log(`Entrega ${fechaEntrega}: ${pedidosAlistados.length} pedido(s) alistado(s); sin camión: ${sinFlota.map((p) => p.expedicion).join(', ') || '(ninguno)'}`);

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
