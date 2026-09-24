// Runner mínimo de migraciones para tms_olo (Aurora PostgreSQL).
//
// No introduce un framework nuevo: sigue la convención ya existente en
// sql/NN_descripcion.sql (ver docs/arquitectura-tms-oms/07-implementation-baseline.md
// §6). Lo único que agrega es lo que pedía el prompt de implementación §7:
// versionado + orden (por nombre de archivo), historial (tabla
// schema_migrations), ejecución controlada (--dry-run por defecto), y
// protección contra reaplicar la misma migración (checksum).
//
// Uso:
//   node --env-file=.env.local scripts/run-migration.mjs sql/06_fase1_multicountry_foundation.sql
//   node --env-file=.env.local scripts/run-migration.mjs sql/06_fase1_multicountry_foundation.sql --execute
//
// Sin --execute: corre dentro de una transacción y hace ROLLBACK siempre
// (dry-run real contra la base, no solo un "parse"). Con --execute: aplica y
// hace COMMIT, y registra el archivo en schema_migrations para que no pueda
// reaplicarse por accidente (a menos que se use --force, para el caso
// legítimo de una migración idempotente que se corrige y se re-corre).

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import pg from 'pg';

const [, , filePath, ...flags] = process.argv;
const execute = flags.includes('--execute');
const force = flags.includes('--force');

if (!filePath) {
  console.error('Uso: node scripts/run-migration.mjs <archivo.sql> [--execute] [--force]');
  process.exit(1);
}

const rawSql = readFileSync(filePath, 'utf8');
// El checksum se calcula sobre el archivo TAL CUAL (para detectar cualquier
// edición futura), pero lo que se EJECUTA le quita un `begin;`/`commit;`
// propios si los tiene (convención heredada de sql/01_*.sql..sql/05_*.sql).
// Bug real encontrado en la implementación de Fase 1 (ver
// docs/arquitectura-tms-oms/implementation/migration-notes.md): un
// `commit;` embebido en el archivo cierra la transacción exterior que este
// runner abre para el modo dry-run, y el ROLLBACK posterior ya no revierte
// nada porque no hay transacción abierta. Este runner es ahora el ÚNICO
// dueño de la transacción — la aplica él, nunca el archivo.
const checksum = createHash('sha256').update(rawSql).digest('hex');
const name = basename(filePath);
const sql = rawSql
  .replace(/^\s*begin\s*;\s*/i, '')
  .replace(/\s*commit\s*;\s*$/i, '');

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
  // Origen en audit.events (sql/16) de lo que cambie una migración.
  application_name: `run-migration ${name}`,
});

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function alreadyApplied(client) {
  const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
  return rows[0] ?? null;
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await ensureMigrationsTable(client);

  const previous = await alreadyApplied(client);
  if (previous && !force) {
    if (previous.checksum === checksum) {
      console.log(`"${name}" ya fue aplicada con el mismo contenido (checksum idéntico). No se hace nada.`);
      await client.query('ROLLBACK');
      process.exit(0);
    }
    console.error(
      `"${name}" ya fue aplicada con OTRO contenido (el archivo cambió después de aplicarse).\n` +
      `Esto normalmente es un error — las migraciones no deberían editarse después de aplicarse;\n` +
      `crea una migración nueva en su lugar. Si estás seguro de reaplicarla, usa --force.`,
    );
    await client.query('ROLLBACK');
    process.exit(1);
  }

  console.log(`${execute ? 'EJECUTANDO' : 'DRY RUN'}: ${name}`);
  await client.query(sql);

  if (execute) {
    await client.query(
      `INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET checksum = $2, applied_at = now()`,
      [name, checksum],
    );
    await client.query('COMMIT');
    console.log(`"${name}" aplicada y registrada en schema_migrations.`);
  } else {
    await client.query('ROLLBACK');
    console.log(`DRY RUN de "${name}" completado sin errores. Base de datos SIN cambios (ROLLBACK). Reintenta con --execute para aplicar.`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`ERROR en "${name}" — ROLLBACK aplicado, ningún cambio quedó en la base:`, err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
