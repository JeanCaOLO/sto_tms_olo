// Limpia los datos de PRUEBA del Tracking en vivo (una o varias rutas por
// route_number). Solo toca la ruta indicada y lo que cuelga de ella.
//
// Uso:
//   node --env-file=.env.local scripts/limpiar-tracking-prueba.mjs                       (dry-run, ruta por defecto)
//   node --env-file=.env.local scripts/limpiar-tracking-prueba.mjs --execute
//   node --env-file=.env.local scripts/limpiar-tracking-prueba.mjs --route VJ-XXXX --execute
//
// Aborta si alguna otra tabla (fuera de la lista conocida) referencia las
// guías o la ruta con filas, para no borrar datos ajenos por cascada manual.

import pg from 'pg';

const execute = process.argv.includes('--execute');
const routeArgs = process.argv.flatMap((a, i, all) => (a === '--route' ? [all[i + 1]] : []));
const ROUTE_NUMBERS = routeArgs.length ? routeArgs : ['VJ-20261002-05A9A400'];

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

// Hijos conocidos, de hoja a raíz. [tabla, columna, de qué id]
const CHILDREN = [
  ['tracking_evidences', 'route_id', 'route'],
  ['tracking_positions', 'route_id', 'route'],
  ['tracking_last_positions', 'route_id', 'route'],
  ['returns', 'dispatch_guide_id', 'guide'],
  ['tracking_events', 'route_id', 'route'],
  ['dispatch_guides', 'route_id', 'route'],
  ['routes', 'id', 'route'],
];
const KNOWN = new Set(CHILDREN.map(([t]) => t));

async function foreignKeysTo(client, table) {
  const { rows } = await client.query(
    `SELECT cl.relname AS child_table, att.attname AS child_column
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_class pt ON pt.oid = con.confrelid
       JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f' AND pt.relname = $1`,
    [table],
  );
  return rows;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: routes } = await client.query(
      'SELECT id, route_number, status FROM routes WHERE route_number = ANY($1::text[])',
      [ROUTE_NUMBERS],
    );
    if (!routes.length) {
      console.log('No hay rutas con esos números:', ROUTE_NUMBERS.join(', '));
      await client.query('ROLLBACK');
      return;
    }
    const routeIds = routes.map((r) => r.id);
    const { rows: guides } = await client.query('SELECT id FROM dispatch_guides WHERE route_id = ANY($1::uuid[])', [routeIds]);
    const guideIds = guides.map((g) => g.id);
    console.log('Rutas:', routes.map((r) => `${r.route_number} (${r.status})`).join(', '));

    // Tablas desconocidas que referencian rutas o guías con filas
    for (const [parent, ids] of [['routes', routeIds], ['dispatch_guides', guideIds]]) {
      for (const fk of await foreignKeysTo(client, parent)) {
        if (KNOWN.has(fk.child_table)) continue;
        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM "${fk.child_table}" WHERE "${fk.child_column}" = ANY($1::uuid[])`,
          [ids],
        );
        if (rows[0].n > 0) {
          throw new Error(`Tabla no prevista ${fk.child_table}.${fk.child_column} tiene ${rows[0].n} fila(s) ligadas; revisar a mano.`);
        }
      }
    }

    const report = {};
    for (const [table, column, kind] of CHILDREN) {
      const ids = kind === 'route' ? routeIds : guideIds;
      const sql = execute
        ? `DELETE FROM "${table}" WHERE "${column}" = ANY($1::uuid[])`
        : `SELECT count(*)::int AS n FROM "${table}" WHERE "${column}" = ANY($1::uuid[])`;
      const res = await client.query(sql, [ids]);
      report[table] = execute ? res.rowCount : res.rows[0].n;
    }
    // viaje de plan: vuelve a quedar sin iniciar (no se borra el plan)
    console.table(report);
    if (execute) {
      await client.query('COMMIT');
      console.log('Aplicado.');
    } else {
      await client.query('ROLLBACK');
      console.log('Dry-run: nada cambió. Usa --execute para aplicar.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
