// SQL de producción sobre PostgreSQL en memoria. No lee .env ni acepta URL de conexión.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modulePath = process.env.TMS_T03_PGLITE_MODULE || join(tmpdir(),
  'tms-t03-postgres-tools/node_modules/@electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
// El módulo solo declara SQL; Python evalúa también la concatenación real de TRIPS_SQL.
const statements = JSON.parse(execFileSync('python', ['-c',
  'import json,runpy,sys; m=runpy.run_path(sys.argv[1]); print(json.dumps({k:v for k,v in m.items() if k.endswith("_SQL") or k=="TRIP_SORT_KEY"}))',
  join(root, 'backend/admin/src/admin_returns_sql.py')], { encoding: 'utf8' }));
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = uuid(1), otherOrg = uuid(2), countryA = uuid(3), countryB = uuid(4);
function bound(sql) { let n = 0; return sql.replace(/%s/g, () => `$${++n}`); }
let db;

function pageQuery({ country = null, countries = null, state = 'todos', cursor = null, limit = 100 } = {}) {
  let filters = '', scope = '';
  const values = [org];
  if (state === 'pendientes') filters += ' AND pending_returns > 0';
  if (state === 'recibidos') filters += ' AND pending_returns = 0';
  if (cursor) {
    filters += ` AND ${statements.TRIP_SORT_KEY} < (%s::boolean, %s::date, %s::boolean, %s::text, %s::uuid)`;
    values.push(cursor.route_date === null, cursor.route_date ?? '0001-01-01',
      cursor.route_number === null, cursor.route_number ?? '', cursor.route_id);
  }
  if (country) { filters += ' AND country_id = %s::uuid'; values.push(country); }
  if (countries !== null) { scope = ' AND country_id = ANY(%s::uuid[])'; values.push(countries); }
  values.push(limit + 1);
  return { sql: bound(statements.TRIPS_SQL.replace('{filters}', filters).replace('{scope}', scope)), values };
}

async function collect(options = {}) {
  const rows = [], limit = options.limit ?? 100;
  let cursor = null;
  for (let attempts = 0; attempts < 100; attempts++) {
    const query = pageQuery({ ...options, limit, cursor });
    const result = (await db.query(query.sql, query.values)).rows;
    const items = result.slice(0, limit);
    rows.push(...items);
    if (result.length <= limit) return rows;
    cursor = items.at(-1);
  }
  assert.fail('La paginación no termina');
}

before(async () => {
  db = new PGlite('memory://');
  await db.waitReady;
  console.log('Engine: ' + (await db.query('select version() AS v')).rows[0].v);
  // Fixtures aislados. Ninguna migración o conexión se aplica a una base externa.
  await db.exec(`
    CREATE TABLE tbl_stores(id uuid PRIMARY KEY,country_id uuid);
    CREATE TABLE tbl_drivers(id uuid PRIMARY KEY,full_name text);
    CREATE TABLE tbl_carriers(id uuid PRIMARY KEY,name text);
    CREATE TABLE tbl_routes(id uuid PRIMARY KEY,organization_id uuid,route_number varchar(100),route_date date,
      plan_trip_id uuid,status text,driver_id uuid,carrier_id uuid,store_id uuid);
    CREATE TABLE tbl_dispatch_guides(id uuid PRIMARY KEY,route_id uuid);
    CREATE TABLE tbl_returns(id uuid PRIMARY KEY,dispatch_guide_id uuid,status text,return_date timestamptz);
    CREATE TABLE tbl_return_forms(id uuid PRIMARY KEY,route_id uuid);
  `);
  await db.query('INSERT INTO tbl_stores VALUES($1,$2),($3,$4)', [uuid(10), countryA, uuid(11), countryB]);
  await db.query(`INSERT INTO tbl_routes
    SELECT ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
      CASE WHEN n=1202 THEN $2::uuid ELSE $1::uuid END,
      CASE WHEN n%7=0 THEN NULL WHEN n%13=0 THEN '' ELSE 'R-' || (n%3)::text END,
      CASE WHEN n%11=0 THEN NULL WHEN n%17=0 THEN DATE '0001-01-01' ELSE DATE '2026-11-12' END,
      NULL,'completed',NULL,NULL,CASE WHEN n%5=0 THEN $4::uuid ELSE $3::uuid END
    FROM generate_series(1,1202) n`, [org, otherOrg, uuid(10), uuid(11)]);
  await db.exec(`INSERT INTO tbl_dispatch_guides SELECT id,id FROM tbl_routes;
    INSERT INTO tbl_returns SELECT r.id,r.id,
      CASE (row_number() OVER(ORDER BY r.id))%6
        WHEN 0 THEN NULL WHEN 1 THEN 'pending' WHEN 2 THEN 'approved'
        WHEN 3 THEN 'received' WHEN 4 THEN 'completed' ELSE 'rejected' END,
      '2026-11-12T00:00:00Z' FROM tbl_routes r;
    INSERT INTO tbl_return_forms VALUES
      ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
      ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');`);
  const migration = readFileSync(join(root, 'sql/70_return_incidents.sql'), 'utf8');
  // Únicamente la vista vigente: no ejecutar el runner ni las concesiones de la migración.
  const view = migration.match(/create or replace view vw_return_trips as[\s\S]*?;/i)?.[0];
  assert.ok(view);
  await db.exec(view);
});
after(async () => { await db?.close(); });

test('reaches all 1201 authorized routes with PostgreSQL null ordering and UUID ties', async () => {
  const expected = (await db.query(`SELECT route_id FROM vw_return_trips WHERE organization_id=$1
    ORDER BY route_date DESC,route_number DESC,route_id DESC`, [org])).rows.map(row => row.route_id);
  const rows = await collect();
  assert.equal(rows.length, 1201);
  assert.equal(new Set(rows.map(row => row.route_id)).size, 1201);
  assert.deepEqual(rows.map(row => row.route_id), expected);
  assert.equal(rows.find(row => row.route_id === uuid(1)).forms_count, 2);
});

for (const state of ['todos', 'pendientes', 'recibidos']) {
  test(`selected country, role scope and cursor remain combined for ${state}`, async () => {
    const predicate = state === 'todos' ? '' : state === 'pendientes' ? ' AND pending_returns>0' : ' AND pending_returns=0';
    const expected = (await db.query(`SELECT route_id FROM vw_return_trips
      WHERE organization_id=$1 AND country_id=$2 ${predicate}
      ORDER BY route_date DESC,route_number DESC,route_id DESC`, [org, countryA])).rows.map(row => row.route_id);
    const rows = await collect({ country: countryA, countries: [countryA], state, limit: 17 });
    assert.deepEqual(rows.map(row => row.route_id), expected);
  });
}

test('country selection cannot widen the role scope and an empty country scope returns no rows', async () => {
  assert.deepEqual(await collect({ country: countryB, countries: [countryA] }), []);
  assert.deepEqual(await collect({ countries: [] }), []);
});

test('summary uses the same country intersection and completed is not pending', async () => {
  const query = bound(statements.SUMMARY_SQL.replace('{filters}', ' AND country_id = %s::uuid')
    .replace('{scope}', ' AND country_id = ANY(%s::uuid[])'));
  const summary = (await db.query(query, [org, countryA, [countryA]])).rows[0];
  const trips = await collect({ country: countryA, countries: [countryA] });
  assert.equal(summary.trips, trips.length);
  assert.equal(summary.returns_pending, trips.reduce((n, row) => n + row.pending_returns, 0));
  assert.equal(summary.returns_received, trips.reduce((n, row) => n + row.received_returns, 0));
  const mismatch = (await db.query(query, [org, countryB, [countryA]])).rows[0];
  assert.equal(mismatch.trips, 0);
  assert.equal(mismatch.returns_pending, 0);
});
