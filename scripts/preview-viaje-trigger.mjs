// Vista previa (SOLO LECTURA) del disparador automático de viajes
// (src/pages/planificacion/viaje-trigger.ts) corriendo contra los pedidos
// REALES ya alistados por el OMS (wms_expediciones, situacion='GENE') y la
// flota REAL de Aurora (carriers/vehicles/drivers).
//
// No escribe nada en la base - solo muestra qué decidiría el motor: qué
// rutas ya deberían salir, por qué (urgencia vs. umbral de acumulación), y
// con qué camión/chofer, respetando la prioridad a flota propia.
//
// Reusa el código TS real (viaje-trigger.ts + priorityEngine.ts +
// fleet-split.ts) vía esbuild en vez de reimplementar la lógica en JS plano,
// para que esta vista previa nunca pueda divergir del comportamiento real.
//
// Uso: node --env-file=.env.local scripts/preview-viaje-trigger.mjs

import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  try {
    const hoyIso = new Date().toISOString().slice(0, 10);

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
        id: row.id,
        order_number: row.expedicion,
        customer_id: row.final_customer_id ?? row.cliente_code,
        store_id: '',
        delivery_address: '',
        delivery_city: '',
        delivery_zone: row.ruta || '(sin ruta)',
        total_weight: 0,
        total_volume: 0,
        status: 'pending',
        order_date: row.fecha_planificada ?? row.fecha_expedicion ?? '',
        customer_name: row.nombre_cliente,
        cant_lineas: row.cant_lineas ?? 0,
        id_compania: row.id_compania,
        prioridad: prioridad.prioridad,
        tier: prioridad.tier,
        esClienteRetira: prioridad.esClienteRetira,
      };
    });

    // Flota disponible: drivers + vehicles reales de Aurora. Simplificación
    // deliberada para esta vista previa: no descuenta camiones ya ocupados en
    // rutas de hoy (routes.route_date) - eso es el siguiente refinamiento
    // antes de automatizar la escritura real.
    //
    // vehicles.carrier_id está NULL en todos los registros reales (gap de
    // datos ya detectado esta sesión) - no se puede join vehículo<->chofer por
    // transportista todavía. Para esta vista previa, se asocia cada chofer con
    // UN vehículo cualquiera (round-robin) solo para poder mostrar la lógica
    // de prioridad de flota funcionando de punta a punta.
    const { rows: drivers } = await client.query(
      `SELECT d.id AS conductor_id, d.full_name, c.is_flota_propia, c.name AS carrier_name
       FROM drivers d JOIN carriers c ON c.id = d.carrier_id`,
    );
    const { rows: vehicles } = await client.query(
      `SELECT id, plate, vehicle_type, capacity_weight, capacity_volume FROM vehicles ORDER BY id`,
    );

    const slotsDisponibles = drivers.map((d, i) => {
      const v = vehicles[i % vehicles.length];
      return {
        vehiculo: {
          id: v.id, plate: v.plate, brand: '', model: '', vehicle_type: v.vehicle_type,
          capacity_weight: Number(v.capacity_weight), capacity_volume: Number(v.capacity_volume),
          is_flota_propia: d.is_flota_propia,
        },
        conductorId: d.conductor_id,
        _conductorNombre: d.full_name,
        _carrierNombre: d.carrier_name,
      };
    });

    console.log(`\n=== Vista previa del disparador automático de viajes (${hoyIso}) ===`);
    console.log(`Pedidos alistados (situación=GENE): ${pedidosAlistados.length}`);
    console.log(`Flota disponible (simplificado, ver nota en el script): ${slotsDisponibles.length} choferes/vehículos\n`);

    const { propuestas, gruposEnEspera } = generarPropuestasDeViaje(pedidosAlistados, slotsDisponibles);

    console.log(`--- VIAJES QUE EL MOTOR DISPARARÍA AHORA: ${propuestas.length} ---`);
    for (const p of propuestas) {
      const slot = p.slotAsignado;
      console.log(`\nRuta ${p.ruta} · motivo: ${p.motivoDisparo.toUpperCase()} · ${p.pedidos.length} pedido(s)`);
      for (const pedido of p.pedidos) {
        const marca = pedido.esClienteRetira ? ' [CLIENTE RETIRA]' : '';
        console.log(`  - ${pedido.order_number} (${pedido.id_compania}) prioridad=${pedido.prioridad} tier=${pedido.tier}${marca}`);
      }
      if (slot) {
        console.log(`  → Asignado: ${slot._conductorNombre} (${slot._carrierNombre}${slot.vehiculo.is_flota_propia ? ' · FLOTA PROPIA' : ''}) en ${slot.vehiculo.plate}`);
      } else {
        console.log('  → SIN FLOTA DISPONIBLE (se dispararía igual, pendiente de asignar camión)');
      }
    }

    console.log(`\n--- RUTAS QUE TODAVÍA ESTÁN ESPERANDO ACUMULAR MÁS CARGA: ${gruposEnEspera.length} ---`);
    for (const g of gruposEnEspera) {
      console.log(`Ruta ${g.ruta}: ${g.pedidos.length} pedido(s) alistado(s), ninguno urgente todavía.`);
    }
    console.log('\n(Vista previa - no se escribió nada en la base.)');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
});
