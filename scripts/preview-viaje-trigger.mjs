// Vista previa (SOLO LECTURA) del disparador automático de viajes: corre el
// motor de Planificación (plan-automatico.ts → planificarDia, ver
// scripts/lib/plan-viajes.mjs) contra los pedidos REALES alistados por el OMS
// con entrega en la fecha objetivo (por defecto mañana) y la flota REAL de
// Aurora (carriers/vehicles/drivers). No escribe nada en la base.
//
// Uso:
//   node --env-file=.env.local scripts/preview-viaje-trigger.mjs
//   node --env-file=.env.local scripts/preview-viaje-trigger.mjs --fecha 2026-09-25

import pg from 'pg';
import { armarFlota, fechaObjetivo, loadEngine, loadPedidosAlistados, propuestasDelDia } from './lib/plan-viajes.mjs';

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
  try {
    const pedidos = await loadPedidosAlistados(client, fechaEntrega, calcularPrioridad);

    // Simplificación de la vista previa: no descuenta camiones ya ocupados ese
    // día (el script de ejecución sí). Parejas sin repetir vehículo: armarFlota.
    const { rows: drivers } = await client.query(
      `SELECT d.id AS conductor_id, d.full_name, d.carrier_id, c.is_flota_propia, c.name AS carrier_name
       FROM drivers d JOIN carriers c ON c.id = d.carrier_id`,
    );
    const { rows: vehicles } = await client.query(
      `SELECT id, plate, vehicle_type, capacity_weight, capacity_volume FROM vehicles ORDER BY id`,
    );
    const slots = armarFlota(drivers, vehicles);

    console.log(`\n=== Vista previa del plan automático · entrega ${fechaEntrega} ===`);
    console.log(`Pedidos alistados para esa fecha: ${pedidos.length} · flota (simplificada): ${slots.length}\n`);

    const { propuestas, sinFlota } = propuestasDelDia(planificarDia, pedidos, slots);
    console.log(`--- VIAJES PROPUESTOS: ${propuestas.length} ---`);
    for (const p of propuestas) {
      console.log(`\nDestino ${p.ruta} · ${p.pedidos.length} pedido(s)`);
      for (const pedido of p.pedidos) {
        const marca = pedido.esClienteRetira ? ' [CLIENTE RETIRA]' : '';
        console.log(`  - ${pedido.expedicion} (${pedido.id_compania}) prioridad=${pedido.prioridad} tier=${pedido.tier}${marca}`);
      }
      const propia = p.slot.vehiculo.is_flota_propia ? ' · FLOTA PROPIA' : '';
      console.log(`  → ${p.slot._conductorNombre} (${p.slot._carrierNombre}${propia}) en ${p.slot.vehiculo.plate}`);
    }
    console.log(`\n--- SIN CAMIÓN DISPONIBLE: ${sinFlota.length} pedido(s) ---`);
    for (const pedido of sinFlota) console.log(`  - ${pedido.expedicion} destino ${pedido.delivery_zone}`);
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
