// Marca el carrier "OLO" como flota propia (carriers.is_flota_propia = true).
// Ver sql/08_carriers_flota_propia.sql y project.md (mandato Jean Carlo,
// prioridad a flota propia en Planificación). Idempotente (UPDATE simple).
//
// Uso:
//   node --env-file=.env.local scripts/mark-flota-propia.mjs            (dry-run)
//   node --env-file=.env.local scripts/mark-flota-propia.mjs --execute  (aplica)

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

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE carriers SET is_flota_propia = true, updated_at = now()
       WHERE name = 'OLO' AND is_flota_propia = false
       RETURNING id, name`,
    );

    console.log(`${execute ? 'EJECUTANDO' : 'DRY RUN'}: filas actualizadas ->`, rows);

    if (rows.length === 0) {
      console.log('Nada que actualizar (ya estaba marcado, o no existe un carrier llamado "OLO" - revisar a mano).');
    }

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
