// Disparador automático de viajes — EJECUCIÓN REAL (no vista previa).
//
// Corre viaje-trigger.ts contra los pedidos alistados REALES (wms_expediciones,
// situacion='GENE' y numero_viaje_wmh IS NULL - o sea, todavía no incorporados
// a ningún viaje) y la flota REAL disponible HOY (excluye choferes/vehículos
// ya ocupados en una ruta de hoy que no esté anulada). Por cada propuesta que
// SÍ consiguió camión:
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
// Las propuestas SIN camión disponible NO crean nada - quedan para la
// próxima corrida (cuando se libere flota). Esto es intencional: nunca se
// crea un viaje sin transporte asignado.
//
// Uso:
//   node --env-file=.env.local scripts/generar-viajes-automatico.mjs            (dry-run)
//   node --env-file=.env.local scripts/generar-viajes-automatico.mjs --execute  (aplica)

import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execute = process.argv.includes('--execute');

async function importPureModule(entryRelativePath) {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, '..', entryRelativePath)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node18',
  });
  const code = result.outputFiles[0].text;
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  return import(dataUrl);
}

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { generarPropuestasDeViaje } = await importPureModule('src/pages/planificacion/viaje-trigger.ts');
  const { calcularPrioridad } = await importPureModule('src/pages/oms/engine/priorityEngine.ts');

  const client = await pool.connect();
  const reporte = { viajesCreados: 0, ordenesCreadas: 0, guiasCreadas: 0, pedidosMarcados: 0, sinFlota: 0, sinRouteType: [] };
  try {
    await client.query('BEGIN');
    const hoyIso = new Date().toISOString().slice(0, 10);

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

    const { rows: routeTypes } = await client.query(`SELECT id, name FROM route_types WHERE organization_id = $1`, [organizationId]);

    // --- pedidos alistados por el OMS, todavía SIN viaje asignado ---
    const { rows: alistadosRows } = await client.query(
      `SELECT id, expedicion, final_customer_id, cliente_code, ruta, fecha_planificada, fecha_expedicion,
              observaciones, nombre_cliente, cant_lineas, id_compania
       FROM wms_expediciones WHERE situacion = 'GENE' AND numero_viaje_wmh IS NULL`,
    );
    const pedidosAlistados = alistadosRows.map((row) => {
      const prioridad = calcularPrioridad(
        {
          fechaPlanificada: row.fecha_planificada ? row.fecha_planificada.toISOString().slice(0, 10) : null,
          fechaExpedicion: row.fecha_expedicion ? row.fecha_expedicion.toISOString().slice(0, 10) : null,
          observaciones: row.observaciones,
        },
        hoyIso,
      );
      return {
        // Mismo número de expedición puede repetirse en varias filas del WMS
        // (múltiples líneas/sucursales de un mismo despacho - ver
        // scripts/seed-wms-expediciones.mjs) - se sufija con el id de la fila
        // para no violar la unicidad de orders.order_number.
        id: row.id, order_number: `${row.expedicion}-${row.id.slice(0, 8)}`, customer_id: row.final_customer_id ?? row.cliente_code,
        store_id: '', delivery_address: '', delivery_city: '', delivery_zone: row.ruta || '(sin ruta)',
        total_weight: 0, total_volume: 0, status: 'pending',
        order_date: row.fecha_planificada ?? row.fecha_expedicion ?? '', customer_name: row.nombre_cliente,
        cant_lineas: row.cant_lineas ?? 0, id_compania: row.id_compania, cliente_code: row.cliente_code,
        prioridad: prioridad.prioridad, tier: prioridad.tier, esClienteRetira: prioridad.esClienteRetira,
      };
    });

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
    // vehicles.carrier_id viene NULL en todos los registros (gap de datos ya
    // documentado) - se asocia cada chofer con un vehículo libre round-robin
    // hasta que ese gap se resuelva.
    const slotsDisponibles = drivers.map((d, i) => {
      const v = vehicles[i % Math.max(vehicles.length, 1)];
      if (!v) return null;
      return {
        vehiculo: {
          id: v.id, plate: v.plate, brand: '', model: '', vehicle_type: v.vehicle_type,
          capacity_weight: Number(v.capacity_weight), capacity_volume: Number(v.capacity_volume),
          is_flota_propia: d.is_flota_propia,
        },
        conductorId: d.conductor_id,
        _carrierId: d.carrier_id,
      };
    }).filter(Boolean);

    const { propuestas, gruposEnEspera } = generarPropuestasDeViaje(pedidosAlistados, slotsDisponibles);

    let contador = 0;
    for (const propuesta of propuestas) {
      if (!propuesta.slotAsignado) {
        reporte.sinFlota++;
        continue;
      }
      contador++;
      const slot = propuesta.slotAsignado;

      const routeType = routeTypes.find((rt) => rt.name.startsWith(`${propuesta.ruta} ·`) || rt.name === propuesta.ruta);
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
           ) VALUES ($1,$2,$3,$4,$5,$5,0,0,$6,0,'(pendiente - sin dirección de línea real todavía)',NULL,$7,$8,'assigned',$9,$10)
           RETURNING id`,
          [
            organizationId, storeId, customerId, pedido.order_number, pedido.order_date || hoyIso,
            pedido.cant_lineas, propuesta.ruta, String(pedido.tier),
            `Generado automáticamente por el disparador de viajes (viaje-trigger.ts) - motivo: ${propuesta.motivoDisparo}.`,
            routeType?.id ?? null,
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
          `Generado automáticamente por el disparador de viajes - motivo: ${propuesta.motivoDisparo}.` +
            (routeType ? '' : ` (ruta "${propuesta.ruta}" sin route_type en el catálogo - queda sin asignar)`),
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
    console.log(`Rutas que siguen esperando acumular carga: ${gruposEnEspera.map((g) => g.ruta).join(', ') || '(ninguna)'}`);

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
