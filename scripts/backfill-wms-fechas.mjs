// Backfill de fecha_planificada/observaciones sobre wms_expediciones.
//
// La captura real de "Expediciones (Salidas)" (ver seed-wms-expediciones.mjs)
// no traía columnas de fecha visibles en las 16 filas capturadas - el seed
// original las dejó NULL. Sin fecha, el Motor de Prioridad (Fase 6,
// src/pages/oms/engine/priorityEngine.ts) no tiene insumo para la regla T-1 y
// todo cae en la banda "sin fecha" (prioridad 50 / tier 4) - por eso la Cola
// se veía plana. Este backfill es 100% SINTÉTICO (fechas y observaciones de
// desarrollo, no copiadas de ninguna captura), pensado solo para tener
// variedad real de prioridades en el ambiente de desarrollo.
//
// Uso:
//   node --env-file=.env.local scripts/backfill-wms-fechas.mjs            (dry-run)
//   node --env-file=.env.local scripts/backfill-wms-fechas.mjs --execute  (aplica)

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

// Offsets de días relativos a hoy, repartidos ciclicamente entre las filas
// para cubrir todas las bandas del motor (vencido, T-1/hoy, +2, +5, sin fecha).
const OFFSETS_DIAS = [-1, 0, 1, 1, 2, 5, null]; // null -> se deja sin fecha a propósito

function addDias(base, dias) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const client = await pool.connect();
  const report = { actualizadas: 0, conClienteRetira: 0, sinFecha: 0 };
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, id_compania, expedicion FROM wms_expediciones ORDER BY id_compania, expedicion`,
    );
    if (rows.length === 0) throw new Error('wms_expediciones está vacía - corré primero scripts/seed-wms-expediciones.mjs');

    const hoy = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < rows.length; i++) {
      const { id } = rows[i];
      const offset = OFFSETS_DIAS[i % OFFSETS_DIAS.length];
      const fechaPlanificada = offset === null ? null : addDias(hoy, offset);
      // Una de cada 9 filas se marca "cliente retira" (dev/sintético) para
      // ejercitar esa regla en la Cola.
      const observaciones = i % 9 === 0 ? 'Cliente retira en bodega - coordinar con seguridad' : null;

      await client.query(
        `UPDATE wms_expediciones SET fecha_planificada = $1, observaciones = $2, updated_at = now() WHERE id = $3`,
        [fechaPlanificada, observaciones, id],
      );
      report.actualizadas++;
      if (observaciones) report.conClienteRetira++;
      if (fechaPlanificada === null) report.sinFecha++;
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
